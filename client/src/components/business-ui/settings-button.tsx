"use client"

import * as React from "react"
import { Settings } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SettingsPanel } from "@/components/business-ui/settings-panel"

export function SettingsButton() {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 rounded-full"
        onClick={() => setOpen(true)}
        aria-label="个性化设置"
      >
        <Settings className="size-4" />
      </Button>
      <SettingsPanel open={open} onOpenChange={setOpen} />
    </>
  )
}
