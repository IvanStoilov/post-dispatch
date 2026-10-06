"use client";
import { Facebook, Instagram } from "@/components/channel-icons";
import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Post, PostAsset, Platform } from "@/lib/types";
import MediaGallery from "./media-gallery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { ArrowUp, ArrowDown, Trash2, Save, Images, Upload } from "lucide-react";

export type MediaItem = {
  id: string;
  file?: File;
  asset?: PostAsset;
  uploadId?: string;
};
export type Draft = Pick<
  Post,
  "title" | "caption" | "imageUrl" | "platforms" | "source"
>;
function FilePreviews({ items, title }: { items: MediaItem[]; title: string }) {
  const [assets, setAssets] = useState<PostAsset[]>([]);
  useEffect(() => {
    const urls: string[] = [];
    const previews = items.flatMap((item) => {
      if (item.asset) return [item.asset];
      if (!item.file) return [];
      const url = URL.createObjectURL(item.file);
      urls.push(url);
      return [
        {
          id: item.id,
          kind:
            item.file.type === "video/mp4" ||
            item.file.name.toLowerCase().endsWith(".mp4")
              ? ("VIDEO" as const)
              : ("IMAGE" as const),
          mimeType: item.file.type,
          url,
        },
      ];
    });
    // Object URLs are browser resources; synchronize their lifetime with the preview.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssets(previews);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [items]);
  return <MediaGallery assets={assets} title={title || "Draft preview"} />;
}
export default function DraftEditor({
  editing,
  initialSnapshot,
  form,
  setForm,
  items,
  setItems,
  busy,
  notice,
  onNotice,
  onClose,
  onSave,
  onDelete,
}: {
  editing: string | null;
  initialSnapshot: string;
  form: Draft;
  setForm: Dispatch<SetStateAction<Draft>>;
  items: MediaItem[];
  setItems: Dispatch<SetStateAction<MediaItem[]>>;
  busy: boolean;
  notice: string;
  onNotice: (message: string) => void;
  onClose: () => void;
  onSave: (event: React.FormEvent) => Promise<void>;
  onDelete: () => void;
}) {
  const [discarding, setDiscarding] = useState(false);
  const dirty =
    !!editing &&
    JSON.stringify({ form, assets: items.map((item) => item.id) }) !==
      initialSnapshot;
  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function attemptClose() {
    if (dirty) setDiscarding(true);
    else onClose();
  }
  function addFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const videos = files.filter(
      (file) =>
        file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4"),
    );
    if (videos.length && files.length !== 1)
      return onNotice("Choose multiple images or a single video.");
    if (
      files.some(
        (file) => file.size > (videos.length ? 100_000_000 : 4_500_000),
      )
    )
      return onNotice(
        "Images must be 4.5 MB or smaller; videos must be 100 MB or smaller.",
      );
    const previous =
      videos.length ||
      items.some(
        (item) =>
          item.asset?.kind === "VIDEO" ||
          item.file?.type === "video/mp4" ||
          item.file?.name.toLowerCase().endsWith(".mp4"),
      )
        ? []
        : items;
    if (previous.length + files.length > 10)
      return onNotice("A post supports up to 10 images.");
    setItems([
      ...previous,
      ...files.map((file) => ({ id: crypto.randomUUID(), file })),
    ]);
    onNotice("");
    if (videos.length) setForm((value) => ({ ...value, imageUrl: "" }));
  }
  function move(index: number, offset: number) {
    setItems((previous) => {
      const next = [...previous];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  }
  return (
    <>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !busy) attemptClose();
        }}
      >
        <DialogContent
          className="max-h-[90svh] overflow-y-auto overscroll-contain sm:max-w-4xl"
          showCloseButton={!busy}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "New draft" : "Review your draft"}
            </DialogTitle>
            <DialogDescription>
              Prepare your post here. Saving a draft keeps it private until you
              publish.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSave} className="flex flex-col gap-6">
            <div className="grid items-start gap-6 md:grid-cols-[1fr_0.85fr]">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="draft-title">Post title</FieldLabel>
                  <Input
                    id="draft-title"
                    name="title"
                    autoComplete="off"
                    required
                    maxLength={120}
                    value={form.title}
                    disabled={busy}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Give this idea a name…"
                  />
                  <FieldDescription>
                    For your workspace; not included in the published caption.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="draft-caption">Caption</FieldLabel>
                  <Textarea
                    id="draft-caption"
                    name="caption"
                    autoComplete="off"
                    required
                    maxLength={2200}
                    rows={8}
                    className="min-h-48"
                    value={form.caption}
                    disabled={busy}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        caption: event.target.value,
                      }))
                    }
                    placeholder="What would you like to share?…"
                  />
                  <FieldDescription className="flex justify-between gap-2">
                    <span>Your post’s published text</span>
                    <span className="tabular-nums">
                      {form.caption.length.toLocaleString()} / 2,200
                    </span>
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel id="draft-channels">Publish to</FieldLabel>
                  <ToggleGroup
                    type="multiple"
                    value={form.platforms}
                    disabled={busy}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        platforms: value as Platform[],
                      }))
                    }
                    aria-labelledby="draft-channels"
                    variant="outline"
                  >
                    <ToggleGroupItem value="facebook">
                      <Facebook data-icon="inline-start" aria-hidden="true" />
                      Facebook
                    </ToggleGroupItem>
                    <ToggleGroupItem value="instagram">
                      <Instagram data-icon="inline-start" aria-hidden="true" />
                      Instagram
                    </ToggleGroupItem>
                  </ToggleGroup>
                  {!form.platforms.length && (
                    <FieldDescription>
                      Select at least one channel to save your draft.
                    </FieldDescription>
                  )}
                </Field>
              </FieldGroup>
              <div className="flex min-w-0 flex-col gap-4">
                {items.length ? (
                  <div className="overflow-hidden rounded-lg border">
                    <FilePreviews items={items} title={form.title} />
                  </div>
                ) : (
                  <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/50">
                    <Images
                      className="size-8 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <p className="text-sm text-muted-foreground">
                      Add images or a video
                    </p>
                  </div>
                )}
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="draft-files">
                      <Upload className="size-4" aria-hidden="true" />
                      Images or video
                    </FieldLabel>
                    <Input
                      id="draft-files"
                      name="media"
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,video/mp4,.mp4"
                      disabled={busy}
                      onChange={addFiles}
                    />
                    <FieldDescription>
                      Up to 10 images (4.5 MB each) or one MP4 (100 MB). Videos
                      publish as Instagram Reels.
                    </FieldDescription>
                  </Field>
                </FieldGroup>
                {!!items.length && (
                  <ol
                    className="flex flex-col gap-1"
                    aria-label="Post media order"
                  >
                    {items.map((item, index) => (
                      <li
                        key={item.id}
                        className="flex min-w-0 items-center gap-1 rounded-lg border p-1.5"
                      >
                        <span className="min-w-0 flex-1 truncate pl-1 text-xs">
                          {index + 1}.{" "}
                          {item.file?.name ||
                            `${item.asset?.kind === "VIDEO" ? "Video" : "Image"} ${index + 1}`}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={busy || index === 0}
                          aria-label={`Move asset ${index + 1} up`}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={busy || index === items.length - 1}
                          aria-label={`Move asset ${index + 1} down`}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={busy}
                          aria-label={`Remove asset ${index + 1}`}
                          onClick={() =>
                            setItems((previous) =>
                              previous.filter((value) => value.id !== item.id),
                            )
                          }
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ol>
                )}
                <Accordion type="single" collapsible>
                  <AccordionItem value="urls">
                    <AccordionTrigger>Import media from URLs</AccordionTrigger>
                    <AccordionContent>
                      <FieldGroup>
                        <Field>
                          <FieldLabel htmlFor="draft-urls" className="sr-only">
                            Media URLs
                          </FieldLabel>
                          <Textarea
                            id="draft-urls"
                            name="mediaUrls"
                            autoComplete="off"
                            spellCheck={false}
                            rows={3}
                            value={form.imageUrl}
                            disabled={busy}
                            onChange={(event) =>
                              setForm((value) => ({
                                ...value,
                                imageUrl: event.target.value,
                              }))
                            }
                            placeholder={
                              "https://example.com/image-1.jpg…\nhttps://example.com/image-2.jpg…"
                            }
                          />
                          <FieldDescription>
                            One public HTTPS URL per line, imported after the
                            selected files. Use multiple images or a single MP4.
                          </FieldDescription>
                        </Field>
                      </FieldGroup>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </div>
            {notice && (
              <Alert role="status" aria-live="polite">
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            )}
            <DialogFooter className="sm:justify-between">
              {editing !== "new" ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={onDelete}
                >
                  <Trash2 data-icon="inline-start" aria-hidden="true" />
                  Delete draft
                </Button>
              ) : (
                <span />
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={attemptClose}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !form.platforms.length}>
                  {busy ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Save data-icon="inline-start" aria-hidden="true" />
                  )}
                  {busy ? "Saving…" : "Save draft"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved copy and media changes will be lost. The saved draft
              stays as it was.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onClose}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
