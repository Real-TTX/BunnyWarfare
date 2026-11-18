using System.Reflection;
using BunnyWarfare.Local;
using MatGame.Shell;

namespace BunnyWarfare.App;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args) => ShellApp.Run(args, new ShellOptions
    {
        GameId = "bunnywarfare",
        Title = "BunnyWarfare",
        DefaultServer = typeof(Program).Assembly.GetCustomAttributes<AssemblyMetadataAttribute>().FirstOrDefault(a => a.Key == "MatGameDefaultServer")?.Value,
        Repository = "Real-TTX/BunnyWarfare",
        LocalGame = () => new BunnyWarfareLocal(),
        Background = Color.FromArgb(0x1f, 0x15, 0x0e),
    });
}
