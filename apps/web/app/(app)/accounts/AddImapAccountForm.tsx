"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastError, toastSuccess } from "@/components/Toast";
import { IMAP_PROVIDER_PRESETS } from "@/utils/imap/types";

export function AddImapAccountForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [testResult, setTestResult] = useState<{
    imap: boolean;
    smtp: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [imapSecurity, setImapSecurity] = useState("tls");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecurity, setSmtpSecurity] = useState("starttls");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const applyPreset = (presetName: string) => {
    const preset = IMAP_PROVIDER_PRESETS.find((p) => p.name === presetName);
    if (!preset) return;
    setImapHost(preset.imapHost);
    setImapPort(preset.imapPort);
    setImapSecurity(preset.imapSecurity);
    setSmtpHost(preset.smtpHost);
    setSmtpPort(preset.smtpPort);
    setSmtpSecurity(preset.smtpSecurity);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const res = await fetch("/api/imap/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imapHost,
          imapPort,
          imapSecurity,
          smtpHost,
          smtpPort,
          smtpSecurity,
          username,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Connection test failed");
        return;
      }

      setTestResult({ imap: data.imap, smtp: data.smtp });
      toastSuccess({ description: "Connection test passed!" });
    } catch {
      setError("Failed to test connection");
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/imap/linking/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: name || undefined,
          imapHost,
          imapPort,
          imapSecurity,
          smtpHost,
          smtpPort,
          smtpSecurity,
          username,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to add IMAP account");
        toastError({
          title: "Failed to add account",
          description: data.error,
        });
        return;
      }

      toastSuccess({ description: "IMAP account added successfully!" });
      setOpen(false);
      router.refresh();
    } catch {
      setError("Failed to add account");
      toastError({ description: "Failed to add IMAP account" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <span className="ml-2">Add IMAP Account</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add IMAP Email Account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <span className="text-sm font-medium">Provider Preset</span>
            <Select onValueChange={applyPreset}>
              <SelectTrigger>
                <SelectValue placeholder="Select a provider (optional)" />
              </SelectTrigger>
              <SelectContent>
                {IMAP_PROVIDER_PRESETS.map((preset) => (
                  <SelectItem key={preset.name} value={preset.name}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="imap-email" className="text-sm font-medium">
                Email Address
              </label>
              <Input
                id="imap-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="imap-name" className="text-sm font-medium">
                Display Name
              </label>
              <Input
                id="imap-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your Name"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="imap-username" className="text-sm font-medium">
                Username
              </label>
              <Input
                id="imap-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Usually your email address"
                required
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="imap-password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="imap-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="App password recommended"
                required
              />
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-sm font-medium mb-2">IMAP (Incoming)</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Input
                  type="text"
                  value={imapHost}
                  onChange={(e) => setImapHost(e.target.value)}
                  placeholder="imap.example.com"
                  required
                />
              </div>
              <Input
                type="number"
                value={imapPort}
                onChange={(e) => setImapPort(Number(e.target.value))}
                placeholder="993"
                required
              />
            </div>
            <Select value={imapSecurity} onValueChange={setImapSecurity}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tls">TLS/SSL</SelectItem>
                <SelectItem value="starttls">STARTTLS</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border-t pt-3">
            <p className="text-sm font-medium mb-2">SMTP (Outgoing)</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Input
                  type="text"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.example.com"
                  required
                />
              </div>
              <Input
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(Number(e.target.value))}
                placeholder="587"
                required
              />
            </div>
            <Select value={smtpSecurity} onValueChange={setSmtpSecurity}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tls">TLS/SSL</SelectItem>
                <SelectItem value="starttls">STARTTLS</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {testResult && (
            <div className="text-sm">
              <p>IMAP: {testResult.imap ? "Connected" : "Failed"}</p>
              <p>SMTP: {testResult.smtp ? "Connected" : "Failed"}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || !imapHost || !username || !password}
              loading={testing}
            >
              Test Connection
            </Button>
            <Button
              type="submit"
              disabled={
                creating || !email || !imapHost || !username || !password
              }
              loading={creating}
            >
              Add Account
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
