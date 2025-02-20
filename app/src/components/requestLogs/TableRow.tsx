import { useMemo } from "react";
import {
  Box,
  Heading,
  Td,
  Tr,
  Thead,
  Th,
  Tooltip,
  Collapse,
  HStack,
  VStack,
  Text,
  Checkbox,
  Link as ChakraLink,
} from "@chakra-ui/react";

import dayjs from "~/utils/dayjs";
import { type RouterOutputs } from "~/utils/api";
import { FormattedJson } from "../FormattedJson";
import { useAppStore } from "~/state/store";
import {
  useIsClientRehydrated,
  useLoggedCalls,
  useTotalNumLogsSelected,
  useTagNames,
} from "~/utils/hooks";
import { StaticColumnKeys } from "~/state/columnVisibilitySlice";
import { useFilters } from "../Filters/useFilters";

type LoggedCall = RouterOutputs["loggedCalls"]["list"]["calls"][0];

export const TableHeader = ({ showOptions }: { showOptions?: boolean }) => {
  const matchingCount = useLoggedCalls().data?.count;
  const deselectedLogIds = useAppStore((s) => s.selectedLogs.deselectedLogIds);
  const defaultToSelected = useAppStore((s) => s.selectedLogs.defaultToSelected);
  const toggleAllSelected = useAppStore((s) => s.selectedLogs.toggleAllSelected);
  const tagNames = useTagNames().data;
  const visibleColumns = useAppStore((s) => s.columnVisibility.visibleColumns);

  const totalNumLogsSelected = useTotalNumLogsSelected();

  const isClientRehydrated = useIsClientRehydrated();
  if (!isClientRehydrated) return null;

  return (
    <Thead>
      <Tr>
        {showOptions && (
          <Th pr={0}>
            <HStack minW={16}>
              <Checkbox
                isChecked={defaultToSelected && !deselectedLogIds.size && totalNumLogsSelected > 0}
                onChange={toggleAllSelected}
                _hover={{ borderColor: "gray.300" }}
              />
              <Text>
                ({totalNumLogsSelected ? `${totalNumLogsSelected.toLocaleString()}/` : ""}
                {(matchingCount ?? 0).toLocaleString()})
              </Text>
            </HStack>
          </Th>
        )}
        {visibleColumns.has(StaticColumnKeys.SENT_AT) && <Th>Sent At</Th>}
        {visibleColumns.has(StaticColumnKeys.MODEL) && <Th>Model</Th>}
        {tagNames
          ?.filter((tagName) => visibleColumns.has(tagName))
          .map((tagName) => (
            <Th key={tagName} textTransform={"none"}>
              {tagName}
            </Th>
          ))}
        {visibleColumns.has(StaticColumnKeys.DURATION) && <Th isNumeric>Duration</Th>}
        {visibleColumns.has(StaticColumnKeys.INPUT_TOKENS) && <Th isNumeric>Input tokens</Th>}
        {visibleColumns.has(StaticColumnKeys.OUTPUT_TOKENS) && <Th isNumeric>Output tokens</Th>}
        {visibleColumns.has(StaticColumnKeys.COST) && <Th isNumeric>Cost</Th>}
        {visibleColumns.has(StaticColumnKeys.STATUS_CODE) && <Th isNumeric>Status</Th>}
      </Tr>
    </Thead>
  );
};

export const TableRow = ({
  loggedCall,
  isExpanded,
  onToggle,
  showOptions,
}: {
  loggedCall: LoggedCall;
  isExpanded: boolean;
  onToggle: () => void;
  showOptions?: boolean;
}) => {
  const isError = loggedCall.modelResponse?.statusCode !== 200;
  const requestedAt = dayjs(loggedCall.requestedAt).format("MMMM D h:mm A");
  const fullTime = dayjs(loggedCall.requestedAt).toString();

  const isChecked = useAppStore(
    (s) =>
      (s.selectedLogs.defaultToSelected && !s.selectedLogs.deselectedLogIds.has(loggedCall.id)) ||
      s.selectedLogs.selectedLogIds.has(loggedCall.id),
  );
  const toggleChecked = useAppStore((s) => s.selectedLogs.toggleSelectedLogId);

  const tagNames = useTagNames().data;
  const visibleColumns = useAppStore((s) => s.columnVisibility.visibleColumns);

  const visibleTagNames = useMemo(() => {
    return tagNames?.filter((tagName) => visibleColumns.has(tagName)) ?? [];
  }, [tagNames, visibleColumns]);

  const isClientRehydrated = useIsClientRehydrated();
  if (!isClientRehydrated) return null;

  return (
    <>
      <Tr
        onClick={onToggle}
        key={loggedCall.id}
        _hover={{ bgColor: "gray.50", cursor: "pointer" }}
        sx={{
          "> td": { borderBottom: "none" },
        }}
        fontSize="sm"
      >
        {showOptions && (
          <Td>
            <Checkbox
              isChecked={isChecked}
              onChange={() => toggleChecked(loggedCall.id)}
              _hover={{ borderColor: "gray.300" }}
            />
          </Td>
        )}
        {visibleColumns.has(StaticColumnKeys.SENT_AT) && (
          <Td>
            <Tooltip label={fullTime} placement="top">
              <Box whiteSpace="nowrap" minW="120px">
                {requestedAt}
              </Box>
            </Tooltip>
          </Td>
        )}
        {visibleColumns.has(StaticColumnKeys.MODEL) && (
          <Td>
            <HStack justifyContent="flex-start">
              <Text
                colorScheme="purple"
                color="purple.500"
                borderColor="purple.500"
                px={1}
                borderRadius={4}
                borderWidth={1}
                fontSize="xs"
                whiteSpace="nowrap"
              >
                {loggedCall.model}
              </Text>
            </HStack>
          </Td>
        )}
        {visibleTagNames.map((tagName) => (
          <Td key={tagName}>{loggedCall.tags[tagName]}</Td>
        ))}
        {visibleColumns.has(StaticColumnKeys.DURATION) && (
          <Td isNumeric>
            {loggedCall.cacheHit ? (
              <Text color="gray.500">Cached</Text>
            ) : (
              ((loggedCall.modelResponse?.durationMs ?? 0) / 1000).toFixed(2) + "s"
            )}
          </Td>
        )}
        {visibleColumns.has(StaticColumnKeys.INPUT_TOKENS) && (
          <Td isNumeric>{loggedCall.modelResponse?.inputTokens}</Td>
        )}
        {visibleColumns.has(StaticColumnKeys.OUTPUT_TOKENS) && (
          <Td isNumeric>{loggedCall.modelResponse?.outputTokens}</Td>
        )}
        {visibleColumns.has(StaticColumnKeys.COST) && (
          <Td isNumeric>
            {loggedCall.modelResponse?.cost && (
              <Tooltip label={`$${loggedCall.modelResponse.cost.toFixed(6)}`}>
                <Text>${loggedCall.modelResponse.cost.toFixed(3)}</Text>
              </Tooltip>
            )}
          </Td>
        )}
        {visibleColumns.has(StaticColumnKeys.STATUS_CODE) && (
          <Td sx={{ color: isError ? "red.500" : "green.500", fontWeight: "semibold" }} isNumeric>
            {loggedCall.modelResponse?.statusCode ?? "No response"}
          </Td>
        )}
      </Tr>
      <Tr>
        <Td colSpan={visibleColumns.size + 1} w="full" p={0}>
          <Collapse in={isExpanded} unmountOnExit={true}>
            <HStack align="stretch" px={6} pt={2} pb={4} spacing={4}>
              <VStack flex={1} align="stretch">
                <Heading size="sm">Input</Heading>
                <FormattedJson json={loggedCall.modelResponse?.reqPayload} />
              </VStack>
              <VStack flex={1} align="stretch">
                <Heading size="sm">Output</Heading>
                <FormattedJson json={loggedCall.modelResponse?.respPayload} />
              </VStack>
            </HStack>
          </Collapse>
        </Td>
      </Tr>
    </>
  );
};

export const EmptyTableRow = ({ filtersApplied = true }: { filtersApplied?: boolean }) => {
  const visibleColumns = useAppStore((s) => s.columnVisibility.visibleColumns);
  const filters = useFilters().filters;
  const { isLoading } = useLoggedCalls();

  if (isLoading) return null;

  if (filters.length && filtersApplied) {
    return (
      <Tr>
        <Td w="full" colSpan={visibleColumns.size + 1}>
          <Text color="gray.500" textAlign="center" w="full" p={4}>
            No matching request logs found. Try removing some filters.
          </Text>
        </Td>
      </Tr>
    );
  }

  return (
    <Tr>
      <Td w="full" colSpan={visibleColumns.size + 1}>
        <Text color="gray.500" textAlign="center" w="full" p={4}>
          This project has no request logs. Learn how to add request logs to your project in our{" "}
          <ChakraLink
            href="https://docs.openpipe.ai/getting-started/quick-start"
            target="_blank"
            color="blue.600"
          >
            Quick Start
          </ChakraLink>{" "}
          guide.
        </Text>
      </Td>
    </Tr>
  );
};
