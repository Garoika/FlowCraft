using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace FlowCraftTray
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            int port = 3344;
            int parentPid = 0;

            if (args.Length > 0) int.TryParse(args[0], out port);
            if (args.Length > 1) int.TryParse(args[1], out parentPid);

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            NotifyIcon trayIcon = new NotifyIcon();
            trayIcon.Text = "FlowCraft (" + port + ")";
            trayIcon.Icon = CreateFlowCraftIcon();
            trayIcon.Visible = true;

            string url = "http://localhost:" + port;

            ContextMenuStrip menu = new ContextMenuStrip();

            ToolStripMenuItem titleItem = new ToolStripMenuItem("⚡ FlowCraft (Порт " + port + ")");
            titleItem.Enabled = false;
            titleItem.Font = new Font(titleItem.Font, FontStyle.Bold);
            menu.Items.Add(titleItem);
            menu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem openCanvas = new ToolStripMenuItem("🎨 Открыть холст");
            openCanvas.Click += (s, e) => {
                try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
            };
            menu.Items.Add(openCanvas);

            ToolStripMenuItem openHub = new ToolStripMenuItem("📂 Хаб всех схем");
            openHub.Click += (s, e) => {
                try { Process.Start(new ProcessStartInfo(url + "/hub") { UseShellExecute = true }); } catch { }
            };
            menu.Items.Add(openHub);

            menu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem exitItem = new ToolStripMenuItem("❌ Закрыть FlowCraft");
            exitItem.Click += (s, e) =>
            {
                trayIcon.Visible = false;
                if (parentPid > 0)
                {
                    try
                    {
                        Process p = Process.GetProcessById(parentPid);
                        p.Kill();
                    }
                    catch { }
                }
                Application.Exit();
            };
            menu.Items.Add(exitItem);

            trayIcon.ContextMenuStrip = menu;

            // Клик левой кнопкой открывает холст
            trayIcon.Click += (s, e) =>
            {
                MouseEventArgs me = e as MouseEventArgs;
                if (me != null && me.Button == MouseButtons.Left)
                {
                    try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
                }
            };

            // Следим за родителем по PID
            if (parentPid > 0)
            {
                System.Threading.Thread monitorThread = new System.Threading.Thread(() =>
                {
                    try
                    {
                        Process p = Process.GetProcessById(parentPid);
                        p.WaitForExit();
                    }
                    catch { }
                    trayIcon.Visible = false;
                    Application.Exit();
                });
                monitorThread.IsBackground = true;
                monitorThread.Start();
            }

            Application.Run();
        }

        static Icon CreateFlowCraftIcon()
        {
            Bitmap bmp = new Bitmap(32, 32);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                // Фон: скругленный синий круг
                using (Brush b = new SolidBrush(Color.FromArgb(2, 132, 199)))
                {
                    g.FillEllipse(b, 2, 2, 28, 28);
                }
                // Иконка молнии внутри
                Point[] lightning = new Point[] {
                    new Point(17, 6),
                    new Point(11, 16),
                    new Point(16, 16),
                    new Point(14, 26),
                    new Point(22, 15),
                    new Point(17, 15),
                    new Point(18, 6)
                };
                using (Brush wb = new SolidBrush(Color.White))
                {
                    g.FillPolygon(wb, lightning);
                }
            }
            return Icon.FromHandle(bmp.GetHicon());
        }
    }
}
