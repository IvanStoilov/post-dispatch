"use client";

import * as React from "react";
import { Upload } from "lucide-react";
import { Button } from "./button";

type FileInputProps = Omit<
  React.ComponentProps<typeof Button>,
  "asChild" | "type" | "onClick"
> & {
  accept?: string;
  multiple?: boolean;
  name?: string;
  capture?: React.ComponentProps<"input">["capture"];
  onFilesSelected: (files: File[]) => void;
};

function FileInput({
  accept,
  multiple,
  name,
  capture,
  disabled,
  onFilesSelected,
  children,
  variant = "outline",
  ...buttonProps
}: FileInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        name={name}
        capture={capture}
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files || []);
          // Allow choosing the same file again after removing it from a draft.
          event.currentTarget.value = "";
          if (files.length) {
            onFilesSelected(files);
          }
        }}
      />
      <Button
        {...buttonProps}
        type="button"
        variant={variant}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {children ?? (
          <>
            <Upload data-icon="inline-start" aria-hidden="true" />
            Choose files
          </>
        )}
      </Button>
    </>
  );
}

export { FileInput, type FileInputProps };
