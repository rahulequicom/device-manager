"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

type Props = {
  children: ReactNode;
  "aria-label": string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
};
const emptyValue = "__app_select_empty__";

export function AppSelect({ children, value, defaultValue = "", onValueChange, ...props }: Props) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selected = value ?? internalValue;
  const options = Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string; disabled?: boolean; children: ReactNode }>(child)) return [];
    return [{ value: child.props.value ?? String(child.props.children), label: child.props.children, disabled: child.props.disabled }];
  });
  const empty = options.find(option => option.value === "");
  const encode = (item: string) => item === "" && empty && !empty.disabled ? emptyValue : item;
  return <Select.Root value={encode(selected)} disabled={props.disabled} required={props.required} onValueChange={next => {
    const decoded = next === emptyValue ? "" : next;
    setInternalValue(decoded); onValueChange?.(decoded);
  }}>
    <Select.Trigger className="app-select-trigger" aria-label={props["aria-label"]} aria-required={props.required}>
      <Select.Value placeholder={empty?.label ?? "Select"} />
      <Select.Icon asChild><ChevronDown size={15} aria-hidden="true" /></Select.Icon>
    </Select.Trigger>
    {props.name && <input type="hidden" name={props.name} value={selected} disabled={props.disabled} />}
    <Select.Portal><Select.Content className="app-select-content" position="popper" sideOffset={5} collisionPadding={10}>
      <Select.ScrollUpButton className="app-select-scroll"><ChevronUp size={15} /></Select.ScrollUpButton>
      <Select.Viewport className="app-select-viewport">{options.filter(option => option.value !== "" || !option.disabled).map(option => <Select.Item key={option.value} value={encode(option.value)} disabled={option.disabled} className="app-select-option">
        <Select.ItemText>{option.label}</Select.ItemText>
        <Select.ItemIndicator className="app-select-check"><Check size={15} /></Select.ItemIndicator>
      </Select.Item>)}</Select.Viewport>
      <Select.ScrollDownButton className="app-select-scroll"><ChevronDown size={15} /></Select.ScrollDownButton>
    </Select.Content></Select.Portal>
  </Select.Root>;
}
