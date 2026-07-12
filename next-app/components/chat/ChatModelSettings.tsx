"use client";

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  USER_SELECTABLE_MODELS,
  type ModelCostClass,
  type SelectableModelId,
} from "@/lib/ai/config";
import type { DeliveryMode, ReasoningEffort } from "@/types/ai";
import {
  isSelectableModelReady,
  type ModelAvailabilityMap,
  type ModelAvailabilityStatus,
} from "@/hooks/useModelAvailability";
import styles from "./ChatModelSettings.module.css";

export type { ModelAvailabilityMap } from "@/hooks/useModelAvailability";

type SelectorPresentation = "dropdown" | "inline";

const COST_CLASS_LABELS: Record<ModelCostClass, string> = {
  lowest: "Lowest cost",
  value: "Value",
  standard: "Standard",
  advanced: "Advanced",
  premium: "Premium",
};

export const REASONING_EFFORT_META: Record<ReasoningEffort, {
  label: string;
  shortLabel: string;
  description: string;
}> = {
  fast: {
    label: "Fast",
    shortLabel: "Fast",
    description: "Quickest response with the least model reasoning.",
  },
  low: {
    label: "Low",
    shortLabel: "Low",
    description: "Light reasoning for straightforward tasks.",
  },
  medium: {
    label: "Medium",
    shortLabel: "Med",
    description: "Balanced reasoning for everyday research work.",
  },
  high: {
    label: "High",
    shortLabel: "High",
    description: "Deeper reasoning for difficult analysis and coding.",
  },
  max: {
    label: "Maximum",
    shortLabel: "Max",
    description: "Most thorough reasoning; slower and potentially more expensive.",
  },
};

function formatLargeTaskCost(cost: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(cost);
}

function joinClassNames(...classNames: Array<string | undefined | false>): string {
  return classNames.filter(Boolean).join(" ");
}

function ModelReadinessNotice({
  status,
  onRetry,
}: {
  status?: ModelAvailabilityStatus;
  onRetry?: () => void;
}) {
  if (!status || status === "ready") return null;

  if (status === "loading") {
    return (
      <div className={styles.readinessNotice} role="status">
        <span className={`material-icons-round ${styles.readinessIcon}`} aria-hidden="true">sync</span>
        <span>Checking model setup…</span>
      </div>
    );
  }

  return (
    <div className={joinClassNames(styles.readinessNotice, styles.readinessNoticeError)} role="alert">
      <span className={`material-icons-round ${styles.readinessIcon}`} aria-hidden="true">error_outline</span>
      <span>Could not verify model setup.</span>
      {onRetry ? (
        <button type="button" className={styles.readinessRetry} onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

type ChatModelSelectorProps = {
  selectedModel: SelectableModelId;
  onModelChange: (modelId: SelectableModelId) => void;
  availability?: ModelAvailabilityMap;
  availabilityStatus?: ModelAvailabilityStatus;
  onRetryAvailability?: () => void;
  presentation?: SelectorPresentation;
  triggerClassName?: string;
  disabled?: boolean;
  side?: "top" | "bottom";
};

export function ChatModelSelector({
  selectedModel,
  onModelChange,
  availability,
  availabilityStatus,
  onRetryAvailability,
  presentation = "dropdown",
  triggerClassName,
  disabled = false,
  side = "top",
}: ChatModelSelectorProps) {
  const [pendingPremiumModel, setPendingPremiumModel] = useState<SelectableModelId | null>(null);
  const selectedModelInfo = USER_SELECTABLE_MODELS.find((model) => model.id === selectedModel)
    ?? USER_SELECTABLE_MODELS[0];

  const requestModelChange = (modelId: SelectableModelId) => {
    const nextModel = USER_SELECTABLE_MODELS.find((model) => model.id === modelId);
    if (
      !nextModel
      || !isSelectableModelReady(availability, availabilityStatus, modelId)
      || modelId === selectedModel
    ) return;
    if (nextModel.premium) {
      setPendingPremiumModel(modelId);
      return;
    }
    onModelChange(modelId);
  };

  const modelOptions = USER_SELECTABLE_MODELS.map((model) => {
    const isAvailable = isSelectableModelReady(availability, availabilityStatus, model.id);
    const isSelected = selectedModel === model.id;
    const content = (
      <>
        <span className={`material-icons-round ${styles.modelIcon}`} aria-hidden="true">
          {model.icon}
        </span>
        <span className={styles.modelCopy}>
          <span className={styles.modelHeading}>
            <span className={styles.modelName}>{model.name}</span>
            <span className={styles.modelRole}>{model.role}</span>
            <span className={joinClassNames(styles.modelCost, styles[`cost_${model.costClass}`])}>
              {COST_CLASS_LABELS[model.costClass]}
            </span>
          </span>
          <span className={styles.modelDescription}>{model.description}</span>
          <span className={styles.modelMeta}>
            {availabilityStatus === "loading"
              ? "Checking setup…"
              : availabilityStatus === "error"
                ? "Readiness unknown"
                : isAvailable
                  ? `${formatLargeTaskCost(model.pricing.standardizedLargeTaskUsd)} base-rate aggregate`
                  : "Setup required"}
          </span>
        </span>
        {isSelected ? (
          <span className={`material-icons-round ${styles.modelCheck}`} aria-hidden="true">check</span>
        ) : null}
      </>
    );

    if (presentation === "inline") {
      return (
        <button
          key={model.id}
          type="button"
          role="radio"
          aria-checked={isSelected}
          disabled={!isAvailable || disabled}
          className={joinClassNames(
            styles.inlineModelOption,
            isSelected && styles.selectedOption,
            !isAvailable && styles.unavailableOption,
          )}
          onClick={() => requestModelChange(model.id)}
        >
          {content}
        </button>
      );
    }

    return (
      <DropdownMenu.RadioItem
        key={model.id}
        value={model.id}
        disabled={!isAvailable || disabled}
        textValue={`${model.name}, ${model.role}, ${COST_CLASS_LABELS[model.costClass]}`}
        className={joinClassNames(
          styles.dropdownModelOption,
          isSelected && styles.selectedOption,
          !isAvailable && styles.unavailableOption,
        )}
      >
        {content}
      </DropdownMenu.RadioItem>
    );
  });

  const selector = presentation === "inline" ? (
    <>
      <ModelReadinessNotice
        status={availabilityStatus}
        onRetry={onRetryAvailability}
      />
      <p className={styles.inlineModelIntro}>
        Base-rate comparison: 500k input and 50k output aggregated across smaller requests,
        not one long-context call.
      </p>
      <div className={styles.inlineModelList} role="radiogroup" aria-label="Model">
        {modelOptions}
      </div>
    </>
  ) : (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={joinClassNames(styles.modelTrigger, triggerClassName)}
          disabled={disabled}
          aria-label={`Model: ${selectedModelInfo.name}`}
        >
          <span className={styles.modelTriggerFull}>{selectedModelInfo.name}</span>
          <span className={styles.modelTriggerShort}>{selectedModelInfo.shortName}</span>
          <span className="material-icons-round" aria-hidden="true">expand_more</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles.modelDropdown}
          side={side}
          align="start"
          sideOffset={6}
          collisionPadding={12}
        >
          <div className={styles.dropdownIntro}>
            <span>Choose a model</span>
            <span>Base-rate aggregate: 500k input + 50k output across smaller requests.</span>
          </div>
          <ModelReadinessNotice
            status={availabilityStatus}
            onRetry={onRetryAvailability}
          />
          <DropdownMenu.RadioGroup
            value={selectedModel}
            onValueChange={(value) => requestModelChange(value as SelectableModelId)}
          >
            {modelOptions}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );

  return (
    <>
      {selector}
      <ConfirmDialog
        isOpen={pendingPremiumModel === "gpt-5.6-sol"}
        title="Use GPT-5.6 Sol?"
        message="Sol is the premium option. For the same base-rate aggregate across smaller requests, it costs about 5× Luna (approximately $4.00 instead of $0.80). A single long-context call can cost more. Choose it when accuracy matters more than cost."
        confirmLabel="Use Sol"
        cancelLabel="Keep current model"
        onConfirm={() => {
          if (
            pendingPremiumModel
            && isSelectableModelReady(availability, availabilityStatus, pendingPremiumModel)
          ) {
            onModelChange(pendingPremiumModel);
          }
          setPendingPremiumModel(null);
        }}
        onCancel={() => setPendingPremiumModel(null)}
      />
    </>
  );
}

type ChatReasoningEffortSelectorProps = {
  selectedModel: SelectableModelId;
  reasoningEffort: ReasoningEffort;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
  presentation?: SelectorPresentation;
  triggerClassName?: string;
  disabled?: boolean;
  side?: "top" | "bottom";
};

export function ChatReasoningEffortSelector({
  selectedModel,
  reasoningEffort,
  onReasoningEffortChange,
  presentation = "dropdown",
  triggerClassName,
  disabled = false,
  side = "top",
}: ChatReasoningEffortSelectorProps) {
  const model = USER_SELECTABLE_MODELS.find((candidate) => candidate.id === selectedModel)
    ?? USER_SELECTABLE_MODELS[0];
  const supportedEfforts = model.reasoningEfforts;
  const visibleReasoningUnavailable = model.reasoningVisibilitySupport === "none";
  const resolvedEffort = supportedEfforts.includes(reasoningEffort)
    ? reasoningEffort
    : model.defaultReasoningEffort;

  const effortOptions = supportedEfforts.map((effort) => {
    const meta = REASONING_EFFORT_META[effort];
    const isSelected = effort === resolvedEffort;
    const content = (
      <>
        <span className={styles.effortOptionCopy}>
          <span className={styles.effortOptionLabel}>{meta.label}</span>
          <span className={styles.effortOptionDescription}>{meta.description}</span>
        </span>
        {isSelected ? (
          <span className={`material-icons-round ${styles.effortCheck}`} aria-hidden="true">check</span>
        ) : null}
      </>
    );

    if (presentation === "inline") {
      return (
        <button
          key={effort}
          type="button"
          role="radio"
          aria-checked={isSelected}
          disabled={disabled}
          className={joinClassNames(styles.inlineEffortOption, isSelected && styles.selectedOption)}
          onClick={() => onReasoningEffortChange(effort)}
        >
          {content}
        </button>
      );
    }

    return (
      <DropdownMenu.RadioItem
        key={effort}
        value={effort}
        className={joinClassNames(styles.dropdownEffortOption, isSelected && styles.selectedOption)}
        disabled={disabled}
      >
        {content}
      </DropdownMenu.RadioItem>
    );
  });

  if (presentation === "inline") {
    return (
      <>
        {visibleReasoningUnavailable ? (
          <p className={styles.inlineEffortIntro}>
            Reasoning effort still applies, but this provider does not return visible reasoning.
          </p>
        ) : null}
        <div className={styles.inlineEffortList} role="radiogroup" aria-label="Reasoning effort">
          {effortOptions}
        </div>
      </>
    );
  }

  const resolvedMeta = REASONING_EFFORT_META[resolvedEffort];
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={joinClassNames(styles.effortTrigger, triggerClassName)}
          disabled={disabled}
          aria-label={`Reasoning effort: ${resolvedMeta.label}`}
        >
          <span className={`material-icons-round ${styles.effortTriggerIcon}`} aria-hidden="true">psychology</span>
          <span className={styles.effortTriggerPrefix}>Reasoning</span>
          <span className={styles.effortTriggerFull}>{resolvedMeta.label}</span>
          <span className={styles.effortTriggerShort}>{resolvedMeta.shortLabel}</span>
          <span className="material-icons-round" aria-hidden="true">expand_more</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles.effortDropdown}
          side={side}
          align="start"
          sideOffset={6}
          collisionPadding={12}
        >
          <div className={styles.dropdownIntro}>
            <span>Reasoning effort</span>
            <span>
              {visibleReasoningUnavailable
                ? "Controls model compute. This provider does not return visible reasoning."
                : "Controls how much compute the model spends. This is separate from reasoning visibility."}
            </span>
          </div>
          <DropdownMenu.RadioGroup
            value={resolvedEffort}
            onValueChange={(value) => onReasoningEffortChange(value as ReasoningEffort)}
          >
            {effortOptions}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

type ChatDeliveryModeControlProps = {
  selectedModel: SelectableModelId;
  deliveryMode: DeliveryMode;
  onDeliveryModeChange: (mode: DeliveryMode) => void;
  presentation?: "compact" | "inline";
  disabled?: boolean;
  requestActive?: boolean;
  actualDeliveryMode?: DeliveryMode | null;
};

export function ChatDeliveryModeControl({
  selectedModel,
  deliveryMode,
  onDeliveryModeChange,
  presentation = "compact",
  disabled = false,
  requestActive = false,
  actualDeliveryMode = null,
}: ChatDeliveryModeControlProps) {
  const model = USER_SELECTABLE_MODELS.find((candidate) => candidate.id === selectedModel);
  if (!model?.deliveryModes.includes("priority")) return null;

  const isPriority = deliveryMode === "priority";
  const priceNote = model.priorityPriceNote ?? "Faster delivery can cost more.";
  const deliveryStatus = requestActive
    ? isPriority
      ? actualDeliveryMode === "priority"
        ? "Provider confirmed priority delivery for this response."
        : actualDeliveryMode === "standard"
          ? "Provider applied standard delivery to this response."
          : "Faster delivery requested; waiting for provider confirmation."
      : actualDeliveryMode
        ? `Provider confirmed ${actualDeliveryMode} delivery for this response.`
        : "Standard delivery requested for this response; waiting for provider confirmation."
    : actualDeliveryMode
      ? `Last response used ${actualDeliveryMode} delivery. The next response uses standard delivery by default.`
      : isPriority
        ? "Faster delivery requested for the next response."
        : "Uses standard delivery unless you request faster delivery.";
  const compactStatus = requestActive
    ? isPriority
      ? actualDeliveryMode === "priority"
        ? "confirmed"
        : actualDeliveryMode === "standard"
          ? "standard applied"
          : "requested"
      : actualDeliveryMode
        ? `${actualDeliveryMode} confirmed`
        : "standard requested"
    : actualDeliveryMode
      ? `last: ${actualDeliveryMode}`
      : isPriority
        ? "next response"
        : "costs more";
  const controlDisabled = disabled || requestActive;

  if (presentation === "inline") {
    return (
      <div className={styles.deliveryInlineRow}>
        <span className={styles.deliveryCopy}>
          <span className={styles.deliveryLabel}>Faster delivery</span>
          <span className={styles.deliveryDescription} aria-live="polite">
            {deliveryStatus} {priceNote}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isPriority}
          aria-label={`Request faster delivery: ${isPriority ? "on" : "off"}. ${deliveryStatus}`}
          className={joinClassNames(styles.deliverySwitch, isPriority && styles.deliverySwitchActive)}
          disabled={controlDisabled}
          onClick={() => onDeliveryModeChange(isPriority ? "standard" : "priority")}
        >
          <span className={styles.deliverySwitchThumb} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isPriority}
      aria-label={`Request faster delivery: ${isPriority ? "on" : "off"}. ${deliveryStatus} ${priceNote}`}
      title={`${deliveryStatus} ${priceNote}`}
      className={joinClassNames(styles.deliveryCompact, isPriority && styles.deliveryCompactActive)}
      disabled={controlDisabled}
      onClick={() => onDeliveryModeChange(isPriority ? "standard" : "priority")}
    >
      <span className="material-icons-round" aria-hidden="true">speed</span>
      <span className={styles.deliveryCompactLabel}>Faster</span>
      <span className={styles.deliveryCostWarning} aria-live="polite">{compactStatus}</span>
    </button>
  );
}

type ChatModelSettingsDialogProps = {
  selectedModel: SelectableModelId;
  onModelChange: (modelId: SelectableModelId) => void;
  availability?: ModelAvailabilityMap;
  availabilityStatus?: ModelAvailabilityStatus;
  onRetryAvailability?: () => void;
  reasoningEffort: ReasoningEffort;
  onReasoningEffortChange?: (effort: ReasoningEffort) => void;
  deliveryMode: DeliveryMode;
  onDeliveryModeChange?: (mode: DeliveryMode) => void;
  disabled?: boolean;
  deliveryRequestActive?: boolean;
  actualDeliveryMode?: DeliveryMode | null;
};

/** Compact settings launcher for narrow embedded composers. */
export function ChatModelSettingsDialog({
  selectedModel,
  onModelChange,
  availability,
  availabilityStatus,
  onRetryAvailability,
  reasoningEffort,
  onReasoningEffortChange,
  deliveryMode,
  onDeliveryModeChange,
  disabled = false,
  deliveryRequestActive = false,
  actualDeliveryMode = null,
}: ChatModelSettingsDialogProps) {
  const selectedModelInfo = USER_SELECTABLE_MODELS.find((model) => model.id === selectedModel)
    ?? USER_SELECTABLE_MODELS[0];
  const resolvedEffort = selectedModelInfo.reasoningEfforts.includes(reasoningEffort)
    ? reasoningEffort
    : selectedModelInfo.defaultReasoningEffort;
  const supportsPriorityDelivery = selectedModelInfo.deliveryModes.includes("priority");
  const controlsLocked = disabled || deliveryRequestActive;

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={styles.compactSettingsTrigger}
          disabled={disabled}
          aria-label={`AI settings: ${selectedModelInfo.name}, ${REASONING_EFFORT_META[resolvedEffort].label} reasoning`}
        >
          <span className="material-icons-round" aria-hidden="true">tune</span>
          <span>{selectedModelInfo.shortName}</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.settingsOverlay} />
        <Dialog.Content className={styles.settingsDialog}>
          <div className={styles.settingsHeader}>
            <div>
              <Dialog.Title className={styles.settingsTitle}>AI settings</Dialog.Title>
              <Dialog.Description className={styles.settingsDescription}>
                Choose the model and reasoning effort
                {supportsPriorityDelivery ? ", plus delivery speed," : ""} for the next message.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className={styles.settingsClose} aria-label="Close AI settings">
                <span className="material-icons-round" aria-hidden="true">close</span>
              </button>
            </Dialog.Close>
          </div>

          <div className={styles.settingsBody}>
            <section className={styles.settingsSection} aria-labelledby="compact-model-heading">
              <h3 id="compact-model-heading" className={styles.settingsSectionTitle}>Model</h3>
              <ChatModelSelector
                selectedModel={selectedModel}
                onModelChange={onModelChange}
                availability={availability}
                availabilityStatus={availabilityStatus}
                onRetryAvailability={onRetryAvailability}
                presentation="inline"
                disabled={controlsLocked}
              />
            </section>

            {onReasoningEffortChange ? (
              <section className={styles.settingsSection} aria-labelledby="compact-effort-heading">
                <h3 id="compact-effort-heading" className={styles.settingsSectionTitle}>Reasoning effort</h3>
                <ChatReasoningEffortSelector
                  selectedModel={selectedModel}
                  reasoningEffort={resolvedEffort}
                  onReasoningEffortChange={onReasoningEffortChange}
                  presentation="inline"
                  disabled={controlsLocked}
                />
              </section>
            ) : null}

            {onDeliveryModeChange && supportsPriorityDelivery ? (
              <section className={styles.settingsSection} aria-labelledby="compact-delivery-heading">
                <h3 id="compact-delivery-heading" className={styles.settingsSectionTitle}>Delivery</h3>
                <ChatDeliveryModeControl
                  selectedModel={selectedModel}
                  deliveryMode={deliveryMode}
                  onDeliveryModeChange={onDeliveryModeChange}
                  presentation="inline"
                  disabled={disabled}
                  requestActive={deliveryRequestActive}
                  actualDeliveryMode={actualDeliveryMode}
                />
              </section>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
