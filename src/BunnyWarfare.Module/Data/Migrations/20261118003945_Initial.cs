using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace BunnyWarfare.Data.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "bunnywarfare");

            migrationBuilder.CreateTable(
                name: "Player",
                schema: "bunnywarfare",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false),
                    DisplayName = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    IsGuest = table.Column<bool>(type: "boolean", nullable: false),
                    TeamName = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    TeamColor = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    LastSeenDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    GamesPlayed = table.Column<int>(type: "integer", nullable: false),
                    GamesWon = table.Column<int>(type: "integer", nullable: false),
                    Kills = table.Column<int>(type: "integer", nullable: false),
                    DamageDealt = table.Column<int>(type: "integer", nullable: false),
                    Xp = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    Fur = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false, defaultValue: "snow"),
                    Outfit = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false, defaultValue: "helmet"),
                    Face = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false, defaultValue: "none"),
                    Frame = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false, defaultValue: "wood"),
                    CreateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateState = table.Column<short>(type: "smallint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Player", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Setting",
                schema: "bunnywarfare",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Key = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Value = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    CreateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdateUserId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Setting", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Weapon",
                schema: "bunnywarfare",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Description = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    Kind = table.Column<short>(type: "smallint", nullable: false),
                    Damage = table.Column<int>(type: "integer", nullable: false),
                    BlastRadius = table.Column<double>(type: "double precision", nullable: false),
                    AffectedByWind = table.Column<bool>(type: "boolean", nullable: false),
                    FuseSeconds = table.Column<double>(type: "double precision", nullable: false),
                    ClusterCount = table.Column<int>(type: "integer", nullable: false),
                    Pellets = table.Column<int>(type: "integer", nullable: false),
                    AmmoPerMatch = table.Column<int>(type: "integer", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    CreateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateState = table.Column<short>(type: "smallint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Weapon", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "World",
                schema: "bunnywarfare",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Description = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    Theme = table.Column<short>(type: "smallint", nullable: false),
                    GridSize = table.Column<int>(type: "integer", nullable: false),
                    HillHeight = table.Column<double>(type: "double precision", nullable: false),
                    Roughness = table.Column<double>(type: "double precision", nullable: false),
                    WaterLevel = table.Column<double>(type: "double precision", nullable: false),
                    Gravity = table.Column<double>(type: "double precision", nullable: false),
                    MaxWind = table.Column<double>(type: "double precision", nullable: false),
                    Seed = table.Column<int>(type: "integer", nullable: false),
                    IsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    CreateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateState = table.Column<short>(type: "smallint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_World", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Match",
                schema: "bunnywarfare",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Token = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    WorldId = table.Column<long>(type: "bigint", nullable: false),
                    HostPlayerId = table.Column<long>(type: "bigint", nullable: false),
                    Status = table.Column<short>(type: "smallint", nullable: false),
                    IsPublic = table.Column<bool>(type: "boolean", nullable: false),
                    MaxTeams = table.Column<int>(type: "integer", nullable: false),
                    BunniesPerTeam = table.Column<int>(type: "integer", nullable: false),
                    BunnyHealth = table.Column<int>(type: "integer", nullable: false),
                    TurnSeconds = table.Column<int>(type: "integer", nullable: false),
                    CrateRate = table.Column<short>(type: "smallint", nullable: false),
                    StartDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    EndDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TurnCount = table.Column<int>(type: "integer", nullable: false),
                    WinnerTeamIndex = table.Column<int>(type: "integer", nullable: true),
                    CreateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdateUserId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Match", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Match_Player_HostPlayerId",
                        column: x => x.HostPlayerId,
                        principalSchema: "bunnywarfare",
                        principalTable: "Player",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Match_World_WorldId",
                        column: x => x.WorldId,
                        principalSchema: "bunnywarfare",
                        principalTable: "World",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MatchTeam",
                schema: "bunnywarfare",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    MatchId = table.Column<long>(type: "bigint", nullable: false),
                    TeamIndex = table.Column<int>(type: "integer", nullable: false),
                    PlayerId = table.Column<long>(type: "bigint", nullable: true),
                    IsBot = table.Column<bool>(type: "boolean", nullable: false),
                    BotLevel = table.Column<short>(type: "smallint", nullable: false),
                    TeamName = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    TeamColor = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    Kills = table.Column<int>(type: "integer", nullable: false),
                    DamageDealt = table.Column<int>(type: "integer", nullable: false),
                    Placement = table.Column<int>(type: "integer", nullable: false),
                    Fur = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false, defaultValue: "snow"),
                    Outfit = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false, defaultValue: "helmet"),
                    Face = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false, defaultValue: "none"),
                    Frame = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false, defaultValue: "wood"),
                    XpGained = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    CreateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreateUserId = table.Column<long>(type: "bigint", nullable: true),
                    UpdateDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdateUserId = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MatchTeam", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MatchTeam_Match_MatchId",
                        column: x => x.MatchId,
                        principalSchema: "bunnywarfare",
                        principalTable: "Match",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MatchTeam_Player_PlayerId",
                        column: x => x.PlayerId,
                        principalSchema: "bunnywarfare",
                        principalTable: "Player",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Match_HostPlayerId",
                schema: "bunnywarfare",
                table: "Match",
                column: "HostPlayerId");

            migrationBuilder.CreateIndex(
                name: "IX_Match_Status",
                schema: "bunnywarfare",
                table: "Match",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_Match_Token",
                schema: "bunnywarfare",
                table: "Match",
                column: "Token",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Match_WorldId",
                schema: "bunnywarfare",
                table: "Match",
                column: "WorldId");

            migrationBuilder.CreateIndex(
                name: "IX_MatchTeam_MatchId_TeamIndex",
                schema: "bunnywarfare",
                table: "MatchTeam",
                columns: new[] { "MatchId", "TeamIndex" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MatchTeam_PlayerId",
                schema: "bunnywarfare",
                table: "MatchTeam",
                column: "PlayerId");

            migrationBuilder.CreateIndex(
                name: "IX_Setting_Key",
                schema: "bunnywarfare",
                table: "Setting",
                column: "Key",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MatchTeam",
                schema: "bunnywarfare");

            migrationBuilder.DropTable(
                name: "Setting",
                schema: "bunnywarfare");

            migrationBuilder.DropTable(
                name: "Weapon",
                schema: "bunnywarfare");

            migrationBuilder.DropTable(
                name: "Match",
                schema: "bunnywarfare");

            migrationBuilder.DropTable(
                name: "Player",
                schema: "bunnywarfare");

            migrationBuilder.DropTable(
                name: "World",
                schema: "bunnywarfare");
        }
    }
}
