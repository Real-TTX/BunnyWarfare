namespace BunnyWarfare.Web;

/// <summary><c>dotnet BunnyWarfare.dll --healthcheck</c>: asks the running app for /api/health (the image needs no curl). Exit code 0 = healthy.</summary>
public static class HealthCheck
{
    public static async Task<int> RunAsync()
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var response = await http.GetAsync($"http://localhost:{AppInfo.Port}/api/health");
            return response.IsSuccessStatusCode ? 0 : 1;
        }
        catch
        {
            return 1;
        }
    }
}
