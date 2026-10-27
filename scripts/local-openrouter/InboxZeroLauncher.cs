using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class InboxZeroLauncher
{
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SetCurrentProcessExplicitAppUserModelID(string appId);

    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        string folder = AppDomain.CurrentDomain.BaseDirectory;
        var config = new JavaScriptSerializer().Deserialize<Dictionary<string, string>>(
            File.ReadAllText(Path.Combine(folder, "launcher.json")));
        SetCurrentProcessExplicitAppUserModelID(config["appUserModelId"]);
        bool servicesOnly = Array.IndexOf(args, "--services-only") >= 0;
        if (servicesOnly) {
            try { EnsureReady(config["root"], folder); }
            catch (Exception error) {
                File.AppendAllText(Path.Combine(folder, "launcher.log"), DateTime.UtcNow.ToString("o") + " background startup failed: " + error.Message + Environment.NewLine);
                Environment.ExitCode = 1;
            }
            return;
        }
        var splash = new Form {
            Text = "Inbox Zero", Width = 360, Height = 120,
            StartPosition = FormStartPosition.CenterScreen,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false, MinimizeBox = false,
            Icon = new Icon(Path.Combine(folder, "Inbox Zero.ico"))
        };
        splash.Controls.Add(new Label {
            Text = "Starting Inbox Zero…", Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter, Font = new Font("Segoe UI", 12)
        });
        splash.Shown += async delegate {
            try {
                await Task.Run(() => EnsureReady(config["root"], folder));
                if (!servicesOnly) {
                    Process.Start(new ProcessStartInfo(config["browser"], config["arguments"]) {
                        UseShellExecute = false, CreateNoWindow = true
                    });
                }
            } catch (Exception error) {
                File.AppendAllText(Path.Combine(folder, "launcher.log"), DateTime.UtcNow.ToString("o") + " failed: " + error.Message + Environment.NewLine);
                MessageBox.Show("Inbox Zero could not start. " + error.Message + "\nSee .context\\logs for details.", "Inbox Zero", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Environment.ExitCode = 1;
            } finally { splash.Close(); }
        };
        Application.Run(splash);
    }

    private static void EnsureReady(string root, string folder)
    {
        using (var mutex = new Mutex(false, "Local\\InboxZeroLocalLauncher")) {
            bool held = false;
            try {
                try { held = mutex.WaitOne(TimeSpan.FromSeconds(120)); }
                catch (AbandonedMutexException) { held = true; }
                if (!held) throw new Exception("Another launch is still starting. Please retry shortly.");
                bool alreadyReady = Ready() && AiWorkerReady(root) && MailJobsReady(root);
                if (!alreadyReady) {
                    string node = Path.GetFullPath(Path.Combine(root, "..", "tools", "node-v24.22.1-win-x64", "node.exe"));
                    if (Listening(3000)) {
                        if (!Healthy("http://127.0.0.1:3000/api/auth/ok", false))
                            throw new Exception("Another app is using Inbox Zero's localhost:3000 address. Free port 3000 before starting Inbox Zero; no other app has been stopped.");
                        using (var stop = Process.Start(new ProcessStartInfo(node, "scripts/local-openrouter/local.mjs stop") {
                            WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true
                        })) {
                            if (!stop.WaitForExit(20000) || stop.ExitCode != 0) throw new Exception("The old local server could not be restarted.");
                        }
                    }
                    Process.Start(new ProcessStartInfo(node, "scripts/local-openrouter/local.mjs start") {
                        WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true
                    });
                    var deadline = DateTime.UtcNow.AddSeconds(90);
                    while (!Ready() || !AiWorkerReady(root) || !MailJobsReady(root)) {
                        if (DateTime.UtcNow > deadline) throw new Exception("The local server did not become ready within 90 seconds.");
                        Thread.Sleep(300);
                    }
                }
                File.AppendAllText(Path.Combine(folder, "launcher.log"), DateTime.UtcNow.ToString("o") + (alreadyReady ? " reused ready services" : " started services and verified readiness") + Environment.NewLine);
            } finally { if (held) mutex.ReleaseMutex(); }
        }
    }

    private static bool MailJobsReady(string root)
    {
        try {
            var status = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(
                File.ReadAllText(Path.Combine(root, ".context", "mail-jobs-status.json")));
            DateTime updated = DateTime.Parse((string)status["updatedAt"]).ToUniversalTime();
            if ((DateTime.UtcNow - updated).TotalSeconds > 120) return false;
            using (var worker = Process.GetProcessById(Convert.ToInt32(status["pid"]))) {
                DateTime started = DateTime.Parse((string)status["startedAt"]).ToUniversalTime();
                return Math.Abs((worker.StartTime.ToUniversalTime() - started).TotalSeconds) < 5 && (string)status["phase"] == "running";
            }
        } catch { return false; }
    }

    private static bool Ready()
    {
        return Listening(5433) && Listening(6380) && Healthy("http://127.0.0.1:8079/health", true)
            && Healthy("http://127.0.0.1:3010/health", false) && Healthy("http://127.0.0.1:3000/api/auth/ok", false)
            && Healthy("http://127.0.0.1:3000/login", false);
    }

    private static bool AiWorkerReady(string root)
    {
        try {
            var status = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(
                File.ReadAllText(Path.Combine(root, ".context", "local-ai", "status.json")));
            DateTime updated = DateTime.Parse((string)status["updatedAt"]).ToUniversalTime();
            if ((DateTime.UtcNow - updated).TotalSeconds > 120) return false;
            using (var worker = Process.GetProcessById(Convert.ToInt32(status["pid"]))) {
                DateTime started = DateTime.Parse((string)status["startedAt"]).ToUniversalTime();
                return !worker.HasExited && Math.Abs((worker.StartTime.ToUniversalTime() - started).TotalSeconds) < 5;
            }
        } catch { return false; }
    }

    private static bool Healthy(string url, bool allowUnauthorized)
    {
        try {
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Timeout = 2000;
            request.ReadWriteTimeout = 2000;
            request.Proxy = null;
            using (var response = (HttpWebResponse)request.GetResponse()) { return response.StatusCode == HttpStatusCode.OK; }
        } catch (WebException error) {
            using (var response = error.Response as HttpWebResponse) {
                return allowUnauthorized && response != null && response.StatusCode == HttpStatusCode.Unauthorized;
            }
        } catch { return false; }
    }

    private static bool Listening(int port)
    {
        try {
            using (var client = new TcpClient()) {
                var result = client.BeginConnect("127.0.0.1", port, null, null);
                if (!result.AsyncWaitHandle.WaitOne(350)) return false;
                client.EndConnect(result);
                return true;
            }
        } catch { return false; }
    }
}
