import { Breadcrumb, BreadcrumbItem, Center, Flex, Icon, Input, VStack } from "@chakra-ui/react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { AiOutlineDatabase } from "react-icons/ai";

import AppShell from "~/components/nav/AppShell";
import { api } from "~/utils/api";
import { useDataset, useHandledAsyncCallback } from "~/utils/hooks";
import PageHeaderContainer from "~/components/nav/PageHeaderContainer";
import ProjectBreadcrumbContents from "~/components/nav/ProjectBreadcrumbContents";
import { useAppStore } from "~/state/store";
import BetaBanner from "~/components/BetaBanner";
import FileUploadsCard from "~/components/datasets/FileUploadsCard";
import DatasetContentTabs from "~/components/datasets/DatasetContentTabs/DatasetContentTabs";

export default function Dataset() {
  const utils = api.useContext();

  const dataset = useDataset();

  const [name, setName] = useState(dataset.data?.name || "");
  useEffect(() => {
    setName(dataset.data?.name || "");
  }, [dataset.data?.name]);

  useEffect(() => {
    useAppStore.getState().sharedArgumentsEditor.loadMonaco().catch(console.error);
  }, []);

  const updateMutation = api.datasets.update.useMutation();
  const [onSaveName] = useHandledAsyncCallback(async () => {
    if (name && name !== dataset.data?.name && dataset.data?.id) {
      await updateMutation.mutateAsync({
        id: dataset.data.id,
        updates: {
          name,
        },
      });
      await Promise.all([utils.datasets.list.invalidate(), utils.datasets.get.invalidate()]);
    }
  }, [updateMutation, dataset.data?.id, dataset.data?.name, name]);

  if (!dataset.isLoading && !dataset.data) {
    return (
      <AppShell title="Dataset not found">
        <Center h="100%">
          <div>Dataset not found 😕</div>
        </Center>
      </AppShell>
    );
  }

  return (
    <AppShell title={dataset.data?.name} containerProps={{ position: "relative" }}>
      <VStack position="sticky" left={0} right={0} w="full">
        <BetaBanner />
        <PageHeaderContainer>
          <Breadcrumb>
            <BreadcrumbItem>
              <ProjectBreadcrumbContents projectName={dataset.data?.project?.name} />
            </BreadcrumbItem>
            <BreadcrumbItem>
              <Link href="/datasets">
                <Flex alignItems="center" _hover={{ textDecoration: "underline" }}>
                  <Icon as={AiOutlineDatabase} boxSize={4} mr={2} /> Datasets
                </Flex>
              </Link>
            </BreadcrumbItem>
            <BreadcrumbItem isCurrentPage>
              <Input
                size="sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={onSaveName}
                borderWidth={1}
                borderColor="transparent"
                fontSize={16}
                px={0}
                minW={{ base: 100, lg: 300 }}
                flex={1}
                _hover={{ borderColor: "gray.300" }}
                _focus={{ borderColor: "blue.500", outline: "none" }}
              />
            </BreadcrumbItem>
          </Breadcrumb>
        </PageHeaderContainer>
      </VStack>
      <DatasetContentTabs />
      <FileUploadsCard />
    </AppShell>
  );
}
