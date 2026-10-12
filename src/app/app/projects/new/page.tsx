"use client";
import { useState } from "react";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { Button } from "@/components/ui/button";
export default function NewProject() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <div className="flex flex-col items-start gap-4">
        <h1 className="display-m">Your publishing workspace</h1>
        <p className="text-sm text-muted-foreground">
          Create a project to start collecting drafts and connect your channels.
        </p>
        <Button onClick={() => setOpen(true)}>Create a project</Button>
      </div>
      {open && <CreateProjectDialog open onOpenChange={setOpen} />}
    </>
  );
}
