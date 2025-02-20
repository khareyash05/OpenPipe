import { TRPCError } from "@trpc/server";
import { sql } from "kysely";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { kysely, prisma } from "~/server/db";
import { trainFineTune } from "~/server/tasks/fineTuning/trainFineTune.task";
import { CURRENT_PIPELINE_VERSION } from "~/types/shared.types";
import { requireCanModifyProject, requireCanViewProject } from "~/utils/accessControl";
import { captureFineTuneCreation } from "~/utils/analytics/serverAnalytics";
import { SUPPORTED_BASE_MODELS, isComparisonModelName } from "~/utils/baseModels";
import { error, success } from "~/utils/errorHandling/standardResponses";

const BaseModelEnum = z.enum(SUPPORTED_BASE_MODELS);

export const fineTunesRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { projectId } = input;

      await requireCanViewProject(projectId, ctx);

      const fineTunes = await kysely
        .selectFrom("FineTune as ft")
        .where("ft.projectId", "=", projectId)
        .leftJoin("Dataset as d", "ft.datasetId", "d.id")
        .selectAll("ft")
        .select(() => [
          "d.name as datasetName",
          sql<number>`(select count(*) from "FineTuneTrainingEntry" where "fineTuneId" = ft.id)::int`.as(
            "numTrainingEntries",
          ),
        ])
        .orderBy("d.createdAt", "desc")
        .orderBy("ft.createdAt", "desc")
        .execute();

      const count = await prisma.fineTune.count({
        where: {
          projectId,
        },
      });

      return {
        fineTunes,
        count,
      };
    }),
  listForDataset: protectedProcedure
    .input(
      z.object({
        datasetId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { datasetId } = input;

      const dataset = await prisma.dataset.findUnique({
        where: {
          id: datasetId,
        },
      });

      if (!dataset) throw new TRPCError({ message: "Dataset not found", code: "NOT_FOUND" });
      await requireCanViewProject(dataset?.projectId, ctx);

      const fineTunes = await kysely
        .selectFrom("FineTune as ft")
        .where("datasetId", "=", datasetId)
        .selectAll()
        .select(() => [
          sql<number>`(select count(*) from "FineTuneTrainingEntry" where "fineTuneId" = ft.id)::int`.as(
            "numTrainingEntries",
          ),
          sql<number>`(select count(*) from "DatasetEntry" where "datasetId" = ft."datasetId" and "split" = 'TEST' and not outdated)::int`.as(
            "numTestingEntries",
          ),
          sql<number>`(select count(*) from "PruningRule" where "fineTuneId" = ft.id)::int`.as(
            "numPruningRules",
          ),
        ])
        .orderBy("ft.createdAt", "desc")
        .execute();

      return fineTunes;
    }),
  get: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const fineTune = await kysely
        .selectFrom("FineTune as ft")
        .where("ft.id", "=", input.id)
        .leftJoin("Dataset as d", "ft.datasetId", "d.id")
        .select("d.name as datasetName")
        .selectAll("ft")
        .select(() => [
          sql<number>`(select count(*) from "FineTuneTrainingEntry" where "fineTuneId" = ft.id)::int`.as(
            "numTrainingEntries",
          ),
          sql<number>`(select count(*) from "DatasetEntry" where "datasetId" = ft."datasetId" and "split" = 'TEST' and not outdated)::int`.as(
            "numTestingEntries",
          ),
          sql<number>`(select count(*) from "PruningRule" where "fineTuneId" = ft.id)::int`.as(
            "numPruningRules",
          ),
        ])
        .executeTakeFirst();

      if (!fineTune) throw new TRPCError({ message: "Fine tune not found", code: "NOT_FOUND" });

      await requireCanViewProject(fineTune.projectId, ctx);

      return fineTune;
    }),
  create: protectedProcedure
    .input(
      z.object({
        datasetId: z.string(),
        slug: z.string(),
        baseModel: BaseModelEnum,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { projectId } = await prisma.dataset.findUniqueOrThrow({
        where: {
          id: input.datasetId,
        },
      });
      await requireCanModifyProject(projectId, ctx);

      if (isComparisonModelName(input.slug)) {
        return error("Fine tune IDs cannot match any base model names");
      }

      const existingFineTune = await prisma.fineTune.findFirst({
        where: {
          slug: input.slug,
        },
      });

      if (existingFineTune) {
        return error("Fine tune IDs have to be globally unique. Please choose a different ID.");
      }

      const fineTune = await prisma.fineTune.create({
        data: {
          projectId,
          slug: input.slug,
          baseModel: input.baseModel,
          datasetId: input.datasetId,
          pipelineVersion: CURRENT_PIPELINE_VERSION,
        },
        include: {
          dataset: {
            include: {
              datasetEntries: {
                select: {
                  id: true,
                  split: true,
                },
                where: {
                  outdated: false,
                  split: "TRAIN",
                },
              },
              pruningRules: {
                select: {
                  id: true,
                  textToMatch: true,
                  tokensInText: true,
                  matches: true,
                },
              },
            },
          },
        },
      });
      if (!fineTune) return error("Error creating fine tune");

      captureFineTuneCreation(
        ctx.session,
        fineTune.projectId,
        input.datasetId,
        input.slug,
        input.baseModel,
      );

      await prisma.fineTuneTrainingEntry.createMany({
        data: fineTune.dataset.datasetEntries.map((datasetEntry) => ({
          fineTuneId: fineTune.id,
          datasetEntryId: datasetEntry.id,
        })),
      });

      // Can't use createMany because of the matches
      await prisma.$transaction(
        fineTune.dataset.pruningRules.map((rule) =>
          prisma.pruningRule.create({
            data: {
              fineTuneId: fineTune.id,
              textToMatch: rule.textToMatch,
              tokensInText: rule.tokensInText,
              matches: {
                create: rule.matches.map((match) => ({
                  datasetEntryId: match.datasetEntryId,
                })),
              },
            },
          }),
        ),
      );
      await trainFineTune.enqueue({ fineTuneId: fineTune.id });

      return success();
    }),
  restartTraining: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const fineTune = await prisma.fineTune.findUnique({
        where: { id: input.id },
      });

      if (!fineTune) return error("Fine tune not found");
      await requireCanModifyProject(fineTune.projectId, ctx);

      await prisma.fineTune.update({
        where: { id: input.id },
        data: {
          status: "PENDING",
          errorMessage: null,
          createdAt: new Date(),
        },
      });

      await trainFineTune.enqueue({ fineTuneId: fineTune.id });

      return success();
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        slug: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const fineTune = await prisma.fineTune.findUnique({
        where: {
          id: input.id,
        },
      });

      if (!fineTune) return error("Fine tune not found");
      await requireCanModifyProject(fineTune.projectId, ctx);

      if (isComparisonModelName(input.slug)) {
        return error("Fine tune IDs cannot match any base model names");
      }

      const existingFineTune = await prisma.fineTune.findFirst({
        where: {
          slug: input.slug,
        },
      });

      if (existingFineTune) return error("A fine tune with that slug already exists");

      await prisma.fineTune.update({
        where: {
          id: input.id,
        },
        data: {
          slug: input.slug,
        },
      });

      return success("Fine tune updated");
    }),
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const fineTune = await prisma.fineTune.findUnique({
        where: {
          id: input.id,
        },
      });

      if (!fineTune) return error("Fine tune not found");
      await requireCanModifyProject(fineTune.projectId, ctx);

      await prisma.fineTune.delete({
        where: {
          id: input.id,
        },
      });
      return success("Fine tune deleted");
    }),
});
