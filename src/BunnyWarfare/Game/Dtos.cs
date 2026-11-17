namespace BunnyWarfare.Game;

// What the hub sends to the browsers (SignalR writes the names in camelCase). The protocol is described in docs/PROTOCOL.md.

public sealed record LobbySlotDto(int TeamIndex, long? PlayerId, string PlayerName, string TeamName, string Color, bool IsBot, string BotLevel, bool Connected);

public sealed record WorldDto(string Name, int Size, double CellSize, string Theme, double WaterLevel, double Gravity, double MaxWind, string Heights);

public sealed record TeamDto(int Index, string Name, string Color, long? PlayerId, bool IsBot, IReadOnlyDictionary<string, int> Ammo, bool Out, int Kills, int Damage);

public sealed record BunnyDto(int Id, int Team, string Name, double X, double Y, double Z, double Yaw, int Health, int MaxHealth);

public sealed record WeaponDto(long Id, string Name, string Kind, int Damage, double Radius, bool Wind, double Fuse, int Count, int Pellets, int Ammo);

public sealed record TurnDto(int Number, int Team, int BunnyId, string Phase, int EndsInMs, int TurnMs, double WindX, double WindZ, double MaxWind, double Stamina, double MaxStamina);

public sealed record GameDto(WorldDto World, IReadOnlyList<TeamDto> Teams, IReadOnlyList<BunnyDto> Bunnies, IReadOnlyList<WeaponDto> Weapons, TurnDto Turn);

public sealed record TeamResultDto(int Index, string Name, string Color, int Placement, int Kills, int Damage, bool IsBot);

public sealed record ResultDto(int? WinnerTeam, string? WinnerName, bool Aborted, IReadOnlyList<TeamResultDto> Teams);

public sealed record RoomDto(string Token, string Name, string Status, long HostPlayerId, string WorldName, string Theme, int MaxTeams, int BunniesPerTeam, int BunnyHealth,
    int TurnSeconds, IReadOnlyList<LobbySlotDto> Slots, GameDto? Game, ResultDto? Result);

/// <summary>A new turn, or a correction of the turn (after a shot, a surrender): the turn, every bunny and every team.</summary>
public sealed record TurnUpdateDto(TurnDto Turn, IReadOnlyList<BunnyDto> Bunnies, IReadOnlyList<TeamDto> Teams);

public sealed record MovedDto(int BunnyId, double X, double Y, double Z, double Yaw, double Stamina, bool Correction);

public sealed record AimDto(int BunnyId, double Yaw, double Pitch, long WeaponId);

public sealed record ChatDto(string Name, string Color, string Text, bool System);

/// <summary>A message for the browsers of a match, collected under the lock and sent in order.</summary>
public sealed record Outgoing(string Method, object Payload, string? OnlyConnection = null);
