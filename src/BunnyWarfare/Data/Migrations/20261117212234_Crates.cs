using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BunnyWarfare.Data.Migrations
{
    /// <summary>How often supply crates drop per match; existing rows and older builds get Normal (2).</summary>
    public partial class Crates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<short>(
                name: "CrateRate",
                table: "Match",
                type: "smallint",
                nullable: false,
                defaultValue: (short)2);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CrateRate",
                table: "Match");
        }
    }
}
