using System.Text;

namespace BunnyWarfare.Web;

/// <summary>The icon sprites, inline in every page for <c>&lt;use href="#mat-i-..."&gt;</c>: the toolkit's and the app's own.</summary>
public sealed class Assets
{
    public Assets(IWebHostEnvironment env)
    {
        Sprite = Read(env, "matui/matui-icons.svg") + Read(env, "img/app-icons.svg");
    }

    public string Sprite { get; }

    private static string Read(IWebHostEnvironment env, string path)
    {
        var file = env.WebRootFileProvider.GetFileInfo(path);
        if (!file.Exists)
        {
            return string.Empty;
        }

        using var reader = new StreamReader(file.CreateReadStream(), Encoding.UTF8);
        return reader.ReadToEnd();
    }
}
