using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BunnyWarfare.Data.Migrations
{
    /// <summary>
    /// Players who played before experience existed get it from their statistics (roughly Business.Cosmetics.XpForMatch:
    /// 25 per match, 75 per win, 30 per knock-out, a quarter of the damage up to 300 per match). Only where the XP is still 0.
    /// </summary>
    public partial class BackfillXp : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE "Player"
                SET "Xp" = 25 * "GamesPlayed" + 75 * "GamesWon" + 30 * "Kills" + LEAST("DamageDealt", 300 * "GamesPlayed") / 4
                WHERE "Xp" = 0 AND "GamesPlayed" > 0;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // the experience stays (it cannot be told apart from what was earned later)
        }
    }
}
