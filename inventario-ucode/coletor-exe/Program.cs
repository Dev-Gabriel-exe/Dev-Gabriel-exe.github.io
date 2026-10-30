using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Management;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Win32;

namespace UCodeInventario;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Any(a => a.Equals("--test", StringComparison.OrdinalIgnoreCase)))
        {
            try
            {
                var result = Collector.Run();
                // WinExe nao tem console obrigatoriamente; grave um marcador para a CI.
                File.WriteAllText(Path.Combine(Path.GetTempPath(), "ucode_coletor_test_result.txt"), result.Path);
                return File.Exists(result.Path) ? 0 : 2;
            }
            catch (Exception ex)
            {
                File.WriteAllText(Path.Combine(Path.GetTempPath(), "ucode_coletor_test_error.txt"), ex.ToString());
                return 1;
            }
        }
        ApplicationConfiguration.Initialize();
        Application.Run(new CollectorWindow());
        return 0;
    }
}

internal sealed record CollectResult(string Path, string Json);

internal sealed class CollectorWindow : Form
{
    private readonly Label status = new()
    {
        Text = "Ao iniciar, o programa coletara hardware e software sem modificar o computador.",
        AutoSize = false, Height = 58, Dock = DockStyle.Top,
        Font = new Font("Segoe UI", 10F), TextAlign = ContentAlignment.MiddleLeft
    };
    private readonly TextBox location = new()
    {
        Dock = DockStyle.Top, ReadOnly = true, Height = 60, Multiline = true,
        Font = new Font("Segoe UI", 9.5F)
    };
    private readonly Button generate = new() { Text = "Gerar JSON novamente", AutoSize = true, Height = 44 };
    private readonly Button folder = new() { Text = "Abrir pasta do arquivo", AutoSize = true, Height = 44, Enabled = false };
    private readonly Button copy = new() { Text = "Copiar JSON", AutoSize = true, Height = 44, Enabled = false };
    private CollectResult? result;

    public CollectorWindow()
    {
        Text = "uCode | Coletor de Inventario Tecnologico";
        Width = 640; Height = 335;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(490, 300);
        BackColor = Color.FromArgb(243, 247, 250);
        Font = new Font("Segoe UI", 10F);
        var main = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(18), ColumnCount = 1, RowCount = 5 };
        main.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        main.RowStyles.Add(new RowStyle(SizeType.Absolute, 72));
        main.RowStyles.Add(new RowStyle(SizeType.Absolute, 75));
        main.RowStyles.Add(new RowStyle(SizeType.Absolute, 56));
        main.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        main.Controls.Add(new Label { Text = "uCode  /  Diagnostico Tecnologico", AutoSize = true, Font = new Font("Segoe UI", 15F, FontStyle.Bold), ForeColor = Color.FromArgb(12, 62, 92), Dock = DockStyle.Fill }, 0, 0);
        main.Controls.Add(status, 0, 1);
        main.Controls.Add(location, 0, 2);
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, FlowDirection = FlowDirection.LeftToRight, AutoScroll = true };
        buttons.Controls.AddRange(new Control[] { generate, folder, copy });
        main.Controls.Add(buttons, 0, 3);
        main.Controls.Add(new Label { Text = "Coleta apenas dados tecnicos; nao recolhe senhas, arquivos pessoais nem chaves de licenca. Revise os dados antes de importar no inventario.", Dock = DockStyle.Fill, AutoSize = false, ForeColor = Color.FromArgb(89, 105, 121) }, 0, 4);
        Controls.Add(main);
        generate.Click += async (_, _) => await GenerateAsync();
        folder.Click += (_, _) =>
        {
            if (result is null) return;
            try { Process.Start(new ProcessStartInfo("explorer.exe", "/select,\"" + result.Path + "\"") { UseShellExecute = true }); }
            catch { MessageBox.Show("Local do arquivo:\n" + result.Path); }
        };
        copy.Click += (_, _) =>
        {
            if (result is null) return;
            try { Clipboard.SetText(result.Json); MessageBox.Show("JSON copiado! Cole no inventario uCode no campo de importacao."); }
            catch (Exception ex) { MessageBox.Show("Nao foi possivel copiar: " + ex.Message); }
        };
    }

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);
        await GenerateAsync();
    }

    private async System.Threading.Tasks.Task GenerateAsync()
    {
        generate.Enabled = false;
        folder.Enabled = false;
        copy.Enabled = false;
        status.Text = "Coletando informacoes e gerando JSON. Aguarde alguns segundos...";
        location.Text = "";
        try
        {
            var ready = await System.Threading.Tasks.Task.Run(Collector.Run);
            result = ready;
            status.Text = "OK! Arquivo criado, verificado e pronto para importar.";
            location.Text = ready.Path;
            folder.Enabled = true;
            copy.Enabled = true;
        }
        catch (Exception ex)
        {
            status.Text = "Nao foi possivel gerar o inventario. Confira a mensagem abaixo.";
            location.Text = ex.Message;
            MessageBox.Show(ex.Message, "Erro de coleta", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally { generate.Enabled = true; }
    }
}

internal static class Collector
{
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
    private static string S(object? value) => Convert.ToString(value, Inv)?.Trim() ?? "";
    private static object? V(Dictionary<string, object?>? row, string key)
        => row != null && row.TryGetValue(key, out var value) ? value : null;
    private static string Str(Dictionary<string, object?>? row, string key) => S(V(row, key));
    private static double GB(object? value)
        => double.TryParse(S(value), NumberStyles.Any, Inv, out double bytes) ? Math.Round(bytes / 1073741824d, 2) : 0;

    // Consulta WMI: alguns drivers/computadores nao fornecem todas as classes. Nao bloquear a coleta.
    private static List<Dictionary<string, object?>> Query(string q, string scope = @"root\CIMV2")
    {
        var output = new List<Dictionary<string, object?>>();
        try
        {
            using var search = new ManagementObjectSearcher(scope, q);
            using var rows = search.Get();
            foreach (ManagementBaseObject mo in rows)
            {
                var values = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                foreach (PropertyData prop in mo.Properties)
                    values[prop.Name] = prop.Value;
                output.Add(values);
                mo.Dispose();
            }
        }
        catch (Exception) { /* Parte dos dados pode depender de driver/permissao. */ }
        return output;
    }

    private static string OsDate(object? val)
    {
        if (val is DateTime dt) return dt.ToString("yyyy-MM-dd");
        var text = S(val);
        if (string.IsNullOrWhiteSpace(text)) return "";
        try { return ManagementDateTimeConverter.ToDateTime(text).ToString("yyyy-MM-dd"); }
        catch
        {
            return DateTime.TryParse(text, out var converted) ? converted.ToString("yyyy-MM-dd") : "";
        }
    }
    private static int Int(object? val)
        => int.TryParse(S(val), NumberStyles.Any, Inv, out var i) ? i : 0;

    private static string Bus(object? val) => Int(val) switch
    {
        11 => "SATA", 17 => "NVMe", 7 => "USB", 8 => "RAID",
        3 => "ATA", 6 => "SAS", 10 => "iSCSI", _ => ""
    };
    private static string Media(object? val) => Int(val) switch
    {
        3 => "HDD", 4 => "SSD", 5 => "SCM", _ => "Unspecified"
    };
    private static string Health(object? val) => Int(val) switch
    {
        0 => "Healthy", 1 => "Warning", 2 => "Unhealthy", _ => "Unknown"
    };
    private static string GpuType(string model)
    {
        string v = model.ToLowerInvariant();
        if (v.Contains("intel") && (v.Contains("iris") || v.Contains("uhd") || v.Contains("hd graphics")) && !v.Contains("arc a") && !v.Contains("arc b"))
            return "Integrada (provavel)";
        if (v.Contains("nvidia") || v.Contains("geforce") || v.Contains("quadro") || v.Contains("radeon rx"))
            return "Dedicada (provavel)";
        return "Nao confirmado";
    }

    private static List<Dictionary<string, object?>> Software()
    {
        var software = new Dictionary<string, Dictionary<string, object?>>(StringComparer.OrdinalIgnoreCase);
        foreach (var baseKey in new[] { Registry.LocalMachine, Registry.CurrentUser })
        {
            foreach (var path in new[]
            {
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
                @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
            })
            {
                try
                {
                    using var root = baseKey.OpenSubKey(path);
                    if (root == null) continue;
                    foreach (var name in root.GetSubKeyNames())
                    {
                        try
                        {
                            using var sub = root.OpenSubKey(name);
                            var display = S(sub?.GetValue("DisplayName"));
                            if (string.IsNullOrWhiteSpace(display)) continue;
                            var version = S(sub?.GetValue("DisplayVersion"));
                            string key = display + "|" + version;
                            if (software.ContainsKey(key)) continue;
                            software[key] = new()
                            {
                                ["DisplayName"] = display,
                                ["DisplayVersion"] = version,
                                ["Publisher"] = S(sub?.GetValue("Publisher")),
                                ["InstallDate"] = S(sub?.GetValue("InstallDate"))
                            };
                        }
                        catch { /* registro individual sem acesso */ }
                    }
                }
                catch { /* chave sem acesso */ }
            }
        }
        return software.Values.OrderBy(s => S(s["DisplayName"]), StringComparer.OrdinalIgnoreCase).Take(900).ToList();
    }

    internal static CollectResult Run()
    {
        var computer = Query("SELECT Manufacturer, Model, TotalPhysicalMemory FROM Win32_ComputerSystem").FirstOrDefault();
        var os = Query("SELECT Caption, Version, BuildNumber, InstallDate, LastBootUpTime FROM Win32_OperatingSystem").FirstOrDefault();
        var bios = Query("SELECT SerialNumber FROM Win32_BIOS").FirstOrDefault();
        var cpu = Query("SELECT Name FROM Win32_Processor").FirstOrDefault();
        var ram = Query("SELECT Manufacturer, PartNumber, Speed, Capacity FROM Win32_PhysicalMemory").Select(r =>
            new Dictionary<string, object?>
            {
                ["Manufacturer"] = Str(r, "Manufacturer"),
                ["PartNumber"] = Str(r, "PartNumber"),
                ["Speed"] = Int(V(r, "Speed")),
                ["CapacityGB"] = GB(V(r, "Capacity"))
            }).ToList();

        var video = Query("SELECT Name, AdapterCompatibility, AdapterRAM, DriverVersion, Status FROM Win32_VideoController");
        var gpus = new List<Dictionary<string, object?>>();
        foreach (var r in video)
        {
            string model = Str(r, "Name");
            string kind = GpuType(model);
            double bytes;
            double? memoryGB = double.TryParse(Str(r, "AdapterRAM"), NumberStyles.Any, Inv, out bytes)
                                && bytes > 0 && bytes < 4294960000d && !kind.StartsWith("Integrada")
                                ? GB(bytes) : null;
            gpus.Add(new Dictionary<string, object?>
            {
                ["Model"] = model,
                ["Manufacturer"] = Str(r, "AdapterCompatibility"),
                ["PossibleType"] = kind,
                ["ReportedMemoryGB"] = memoryGB,
                ["DriverVersion"] = Str(r, "DriverVersion"),
                ["Status"] = Str(r, "Status")
            });
        }
        bool integrated = gpus.Any(g => S(g["PossibleType"]).StartsWith("Integrada"));
        bool dedicated = gpus.Any(g => S(g["PossibleType"]).StartsWith("Dedicada"));
        string gpuType = integrated && dedicated ? "Integrada + dedicada (provavel)"
                        : integrated && gpus.Count == 1 ? "Integrada (provavel)"
                        : dedicated && gpus.Count == 1 ? "Dedicada (provavel)"
                        : "Nao confirmado";

        // Windows Storage WMI: SSD/HDD pode estar indisponivel em alguns controladores.
        var physical = Query("SELECT FriendlyName, SerialNumber, MediaType, BusType, HealthStatus, OperationalStatus, Size FROM MSFT_PhysicalDisk", @"root\Microsoft\Windows\Storage");
        var physicalDisks = physical.Select(p => new Dictionary<string, object?>
        {
            ["FriendlyName"] = Str(p, "FriendlyName"),
            ["SerialNumber"] = Str(p, "SerialNumber"),
            ["MediaType"] = Media(V(p, "MediaType")),
            ["BusType"] = Bus(V(p, "BusType")),
            ["HealthStatus"] = Health(V(p, "HealthStatus")),
            ["OperationalStatus"] = S(V(p, "OperationalStatus")),
            ["SizeGB"] = GB(V(p, "Size"))
        }).ToList();
        var winDisks = Query("SELECT Model, SerialNumber, MediaType, InterfaceType, Size FROM Win32_DiskDrive");
        var disks = new List<Dictionary<string, object?>>();
        foreach (var w in winDisks)
        {
            var serial = Str(w, "SerialNumber").Trim();
            var size = GB(V(w, "Size"));
            var matches = physicalDisks.Where(p => !string.IsNullOrEmpty(serial)
                && string.Equals(serial, S(p["SerialNumber"]).Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
            if (matches.Count != 1)
                matches = physicalDisks.Where(p => Math.Abs(size - Convert.ToDouble(p["SizeGB"], Inv)) < 2).ToList();
            if (matches.Count != 1 && physicalDisks.Count == 1 && winDisks.Count == 1)
                matches = physicalDisks;
            var disk = matches.Count == 1 ? matches[0] : null;
            string bus = disk == null ? "" : S(disk["BusType"]);
            string media = disk == null ? "" : S(disk["MediaType"]);
            string type = media == "HDD" ? "HD"
                : media == "SSD" ? (bus == "NVMe" ? "SSD NVMe" : bus == "SATA" ? "SSD SATA" : "SSD (barramento nao confirmado)")
                : bus == "NVMe" ? "SSD NVMe"
                : "Nao identificado";
            disks.Add(new Dictionary<string, object?>
            {
                ["Model"] = Str(w, "Model"),
                ["SerialNumber"] = serial,
                ["SizeGB"] = size,
                ["DiskType"] = type,
                ["BusType"] = bus,
                ["HealthStatus"] = disk == null ? "" : S(disk["HealthStatus"]),
                ["MediaType"] = Str(w, "MediaType")
            });
        }
        var logical = Query("SELECT DeviceID, VolumeName, FileSystem, Size, FreeSpace FROM Win32_LogicalDisk WHERE DriveType=3")
            .Select(l => new Dictionary<string, object?>
            {
                ["DeviceID"] = Str(l, "DeviceID"),
                ["VolumeName"] = Str(l, "VolumeName"),
                ["FileSystem"] = Str(l, "FileSystem"),
                ["SizeGB"] = GB(V(l, "Size")),
                ["FreeGB"] = GB(V(l, "FreeSpace"))
            }).ToList();
        var knownTypes = disks.Select(d => S(d["DiskType"])).Where(t => t != "Nao identificado").Distinct().ToList();
        string storageType = knownTypes.Contains("HD") && knownTypes.Any(t => t.StartsWith("SSD"))
            ? "Hibrido (HD + SSD)" : knownTypes.Count == 1 ? knownTypes[0]
            : knownTypes.Count > 1 ? string.Join(" + ", knownTypes) : "Nao identificado";

        var network = new List<Dictionary<string, object?>>();
        var adapters = new List<Dictionary<string, object?>>();
        try
        {
            foreach (var ni in NetworkInterface.GetAllNetworkInterfaces().Where(n => n.OperationalStatus == OperationalStatus.Up))
            {
                var props = ni.GetIPProperties();
                string ipv4 = props.UnicastAddresses.FirstOrDefault(a => a.Address.AddressFamily == AddressFamily.InterNetwork)?.Address.ToString() ?? "";
                if (ipv4.Length == 0) continue;
                string gateway = props.GatewayAddresses.FirstOrDefault(g => g.Address.AddressFamily == AddressFamily.InterNetwork)?.Address.ToString() ?? "";
                network.Add(new Dictionary<string, object?>
                {
                    ["name"] = ni.Name, ["ipv4"] = ipv4, ["gateway"] = gateway,
                    ["dns"] = string.Join(", ", props.DnsAddresses.Select(d => d.ToString()))
                });
                adapters.Add(new Dictionary<string, object?>
                {
                    ["Name"] = ni.Name, ["MacAddress"] = ni.GetPhysicalAddress().ToString(),
                    ["LinkSpeed"] = ni.Speed.ToString(Inv)
                });
            }
        }
        catch { /* interface sem informacoes */ }

        string hostname = Environment.MachineName;
        var obj = new Dictionary<string, object?>
        {
            ["collector"] = "uCode Inventario EXE v1",
            ["collectedAt"] = DateTimeOffset.Now.ToString("o"),
            ["hostname"] = hostname,
            ["serial"] = Str(bios, "SerialNumber"),
            ["vendor"] = Str(computer, "Manufacturer"),
            ["model"] = Str(computer, "Model"),
            ["cpu"] = Str(cpu, "Name"),
            ["ramGB"] = GB(V(computer, "TotalPhysicalMemory")),
            ["ramModules"] = ram,
            ["gpus"] = gpus,
            ["gpuType"] = gpuType,
            ["os"] = Str(os, "Caption"),
            ["osVersion"] = Str(os, "Version"),
            ["windowsBuild"] = Str(os, "BuildNumber"),
            ["windowsInstallDate"] = OsDate(V(os, "InstallDate")),
            ["lastBoot"] = OsDate(V(os, "LastBootUpTime")),
            ["disks"] = disks,
            ["physicalDisks"] = physicalDisks,
            ["logicalDisks"] = logical,
            ["storageType"] = storageType,
            ["storageTotalGB"] = Math.Round(disks.Sum(d => Convert.ToDouble(d["SizeGB"], Inv)), 2),
            ["storageFreeGB"] = Math.Round(logical.Sum(d => Convert.ToDouble(d["FreeGB"], Inv)), 2),
            ["network"] = network,
            ["adapters"] = adapters,
            ["software"] = Software()
        };
        var opts = new JsonSerializerOptions
        {
            WriteIndented = true,
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        };
        string json = JsonSerializer.Serialize(obj, opts);
        using (var verified = JsonDocument.Parse(json))
        {
            if (!verified.RootElement.TryGetProperty("hostname", out var hn) || string.IsNullOrWhiteSpace(hn.GetString()))
                throw new IOException("Nao foi possivel identificar o nome do computador.");
        }

        string safe = new string(hostname.Where(c => char.IsLetterOrDigit(c) || c == '-' || c == '_').ToArray());
        if (string.IsNullOrEmpty(safe)) safe = "PC";
        string filename = "ucode_inventario_" + safe + "_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".json";
        string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        string[] folders =
        {
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            Path.Combine(home, "Desktop"),
            Path.Combine(home, "Downloads"),
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            Environment.GetEnvironmentVariable("TEMP") ?? Path.GetTempPath()
        };
        var errors = new List<string>();
        foreach (string folder in folders.Where(f => !string.IsNullOrWhiteSpace(f)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            try
            {
                if (!Directory.Exists(folder)) continue;
                string path = Path.Combine(folder, filename);
                File.WriteAllText(path, json, new UTF8Encoding(false));
                if (!File.Exists(path) || new FileInfo(path).Length < 20)
                    throw new IOException("Arquivo nao foi criado ou ficou vazio.");
                using var doc = JsonDocument.Parse(File.ReadAllText(path, Encoding.UTF8));
                if (doc.RootElement.GetProperty("hostname").GetString() != hostname)
                    throw new IOException("O JSON gravado nao corresponde ao computador.");
                return new CollectResult(path, json);
            }
            catch (Exception ex) { errors.Add(folder + ": " + ex.Message); }
        }
        throw new IOException("Nao foi possivel gravar o JSON nas pastas disponiveis.\n" + string.Join("\n", errors));
    }
}
