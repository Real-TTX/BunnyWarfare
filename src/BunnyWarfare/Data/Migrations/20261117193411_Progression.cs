using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BunnyWarfare.Data.Migrations
{
    /// <inheritdoc />
    public partial class Progression : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Face",
                table: "Player",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "none");

            migrationBuilder.AddColumn<string>(
                name: "Frame",
                table: "Player",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "wood");

            migrationBuilder.AddColumn<string>(
                name: "Fur",
                table: "Player",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "snow");

            migrationBuilder.AddColumn<string>(
                name: "Outfit",
                table: "Player",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "helmet");

            migrationBuilder.AddColumn<int>(
                name: "Xp",
                table: "Player",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Face",
                table: "MatchTeam",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "none");

            migrationBuilder.AddColumn<string>(
                name: "Frame",
                table: "MatchTeam",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "wood");

            migrationBuilder.AddColumn<string>(
                name: "Fur",
                table: "MatchTeam",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "snow");

            migrationBuilder.AddColumn<string>(
                name: "Outfit",
                table: "MatchTeam",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "helmet");

            migrationBuilder.AddColumn<int>(
                name: "XpGained",
                table: "MatchTeam",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Face",
                table: "Player");

            migrationBuilder.DropColumn(
                name: "Frame",
                table: "Player");

            migrationBuilder.DropColumn(
                name: "Fur",
                table: "Player");

            migrationBuilder.DropColumn(
                name: "Outfit",
                table: "Player");

            migrationBuilder.DropColumn(
                name: "Xp",
                table: "Player");

            migrationBuilder.DropColumn(
                name: "Face",
                table: "MatchTeam");

            migrationBuilder.DropColumn(
                name: "Frame",
                table: "MatchTeam");

            migrationBuilder.DropColumn(
                name: "Fur",
                table: "MatchTeam");

            migrationBuilder.DropColumn(
                name: "Outfit",
                table: "MatchTeam");

            migrationBuilder.DropColumn(
                name: "XpGained",
                table: "MatchTeam");
        }
    }
}
