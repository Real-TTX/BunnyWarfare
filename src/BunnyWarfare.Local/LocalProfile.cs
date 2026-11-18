using System.Text.Json;
using BunnyWarfare.Business;
using BunnyWarfare.Data;
using MatGame.Local;

namespace BunnyWarfare.Local;

/// <summary>A finished offline match of the local player (the "last matches" of the home screen).</summary>
public sealed record LocalHistoryEntry(Guid Token, string Name, string WorldName, string Status, DateTime EndDate, int Placement, int Kills, int DamageDealt, int XpGained);

/// <summary>
/// The offline player on this device: name, team, look, numbers and experience, and the last matches. Kept as <c>profile.json</c> in the app's data folder.
/// It has its own progress (level and unlocks follow the same rules as online, but nothing of it is ever sent to a server).
/// </summary>
public sealed class LocalProfile
{
    public const string FileName = "profile.json";

    private static readonly JsonSerializerOptions Options = new(LocalJson.Options) { WriteIndented = true };

    public Player Player { get; set; } = new();

    public List<LocalHistoryEntry> History { get; set; } = [];

    /// <summary>Reads the profile (a new one when there is none, or when the file cannot be read: the old file is kept as profile.json.broken).</summary>
    public static LocalProfile Load(string directory, string playerName)
    {
        var path = Path.Combine(directory, FileName);
        if (File.Exists(path))
        {
            try
            {
                var profile = JsonSerializer.Deserialize<LocalProfile>(File.ReadAllText(path), Options);
                if (profile?.Player is not null)
                {
                    profile.Player.Id = BunnyWarfareLocal.LocalPlayerId;
                    return profile;
                }
            }
            catch (JsonException)
            {
                File.Copy(path, path + ".broken", overwrite: true);
            }
        }

        var name = string.IsNullOrWhiteSpace(playerName) ? "Gast" : playerName.Trim();
        return new LocalProfile
        {
            Player = new Player
            {
                Id = BunnyWarfareLocal.LocalPlayerId,
                DisplayName = name.Length > 60 ? name[..60] : name,
                IsGuest = true,
                TeamName = GameRules.TeamNameFor(name),
                TeamColor = GameRules.TeamColors[0].Value,
                Fur = Cosmetics.StarterFur(Random.Shared),
                CreateDate = DateTime.UtcNow,
            },
        };
    }

    /// <summary>Writes the profile (to a temporary file first, so a crash never leaves half a file).</summary>
    public void Save(string directory)
    {
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, FileName);
        var temporary = path + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(this, Options));
        File.Move(temporary, path, overwrite: true);
    }
}
