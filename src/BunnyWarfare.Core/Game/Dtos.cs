namespace BunnyWarfare.Game;

// What the hub sends to the browsers (SignalR writes the names in camelCase). The protocol is described in docs/PROTOCOL.md.

public sealed record LobbySlotDto(int TeamIndex, long? PlayerId, string PlayerName, string TeamName, string Color, bool IsBot, string BotLevel, bool Connected,
    string Fur, string Outfit, string Face, string Frame, int Level);

public sealed record WorldDto(string Name, int Size, double CellSize, string Theme, double WaterLevel, double Gravity, double MaxWind, string Heights);

/// <summary>A team of the match; fur/outfit/face are how its bunnies look (keys of Business.Cosmetics), frame the frame of its portrait.</summary>
/// <summary>effects: what supply crates gave the team for later ("double" = the next shot does double damage, "turbo" = more stamina next turn).</summary>
public sealed record TeamDto(int Index, string Name, string Color, long? PlayerId, bool IsBot, IReadOnlyDictionary<string, int> Ammo, bool Out, int Kills, int Damage,
    string Fur, string Outfit, string Face, string Frame, int Level, IReadOnlyList<string> Effects);

/// <summary>shield: hits the "Panzerfell" of a crate still halves (0 = none).</summary>
public sealed record BunnyDto(int Id, int Team, string Name, double X, double Y, double Z, double Yaw, int Health, int MaxHealth, int Shield = 0);

/// <summary>A supply crate on the island (its bottom); look: "weapon", "health" or "support" – the content is a secret until it is picked up.</summary>
public sealed record CrateDto(int Id, double X, double Y, double Z, string Look);

/// <summary>A crate falls (sent right after the Turn message of the turn it falls in; that message already lists it).</summary>
public sealed record CrateDropDto(CrateDto Crate);

/// <summary>A bunny walked onto a crate: what it got (German text), the team (ammo, effects), the bunny (health, shield) and the stamina of the turn after it.</summary>
public sealed record CratePickedDto(int CrateId, int BunnyId, int Team, string Look, string Text, TeamDto TeamState, BunnyDto Bunny, double Stamina);

public sealed record WeaponDto(long Id, string Name, string Kind, int Damage, double Radius, bool Wind, double Fuse, int Count, int Pellets, int Ammo);

public sealed record TurnDto(int Number, int Team, int BunnyId, string Phase, int EndsInMs, int TurnMs, double WindX, double WindZ, double MaxWind, double Stamina, double MaxStamina);

public sealed record GameDto(WorldDto World, IReadOnlyList<TeamDto> Teams, IReadOnlyList<BunnyDto> Bunnies, IReadOnlyList<WeaponDto> Weapons, TurnDto Turn,
    IReadOnlyList<CrateDto> Crates);

/// <summary>A team at the end of a match; for a player's team also the experience it brought (xpGained), the level before and after, and what it unlocked.</summary>
public sealed record TeamResultDto(int Index, string Name, string Color, int Placement, int Kills, int Damage, bool IsBot, string Fur, string Outfit, string Face, string Frame,
    int Level, int XpGained, int LevelBefore, int LevelAfter, IReadOnlyList<Business.Unlock> Unlocked);

public sealed record ResultDto(int? WinnerTeam, string? WinnerName, bool Aborted, IReadOnlyList<TeamResultDto> Teams);

public sealed record RoomDto(string Token, string Name, string Status, long HostPlayerId, string WorldName, string Theme, int MaxTeams, int BunniesPerTeam, int BunnyHealth,
    int TurnSeconds, IReadOnlyList<LobbySlotDto> Slots, GameDto? Game, ResultDto? Result, int CrateRate, string CrateRateName);

/// <summary>A new turn, or a correction of the turn (after a shot, a surrender): the turn, every bunny and every team.</summary>
public sealed record TurnUpdateDto(TurnDto Turn, IReadOnlyList<BunnyDto> Bunnies, IReadOnlyList<TeamDto> Teams, IReadOnlyList<CrateDto> Crates);

public sealed record MovedDto(int BunnyId, double X, double Y, double Z, double Yaw, double Stamina, bool Correction);

public sealed record AimDto(int BunnyId, double Yaw, double Pitch, long WeaponId);

public sealed record ChatDto(string Name, string Color, string Text, bool System);

/// <summary>
/// A message for the browsers of a match, collected under the lock and sent in order. ToAll: also to the sender when the change itself
/// is only relayed to the others (a crate picked up during a move).
/// </summary>
public sealed record Outgoing(string Method, object Payload, string? OnlyConnection = null, bool ToAll = false);
