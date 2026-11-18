using Microsoft.EntityFrameworkCore;

namespace BunnyWarfare.Data;

/// <summary>
/// The tables of BunnyWarfare in the database of MatGame (PostgreSQL), all in the schema <see cref="Schema"/> with their own migration history there.
/// Tables and columns are PascalCase, every key is a bigint "Id" (the key of <see cref="Player"/> is the MatGame account id).
/// Saving fills the audit columns: CreateDate/CreateUserId for new records, UpdateDate/UpdateUserId always, UpdateState = Updated for changed soft-delete records.
/// The business layer says who acts with <see cref="ActingAs"/>.
/// </summary>
public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Player> Players => Set<Player>();

    public DbSet<World> Worlds => Set<World>();

    public DbSet<Weapon> Weapons => Set<Weapon>();

    public DbSet<Match> Matches => Set<Match>();

    public DbSet<MatchTeam> MatchTeams => Set<MatchTeam>();

    public DbSet<Setting> Settings => Set<Setting>();

    public const string Schema = "bunnywarfare";

    /// <summary>The player whose changes are saved (null = the system).</summary>
    public long? ActorId { get; private set; }

    public AppDbContext ActingAs(long? playerId)
    {
        ActorId = playerId;
        return this;
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.Entity<Player>(e =>
        {
            e.ToTable("Player");
            e.Property(p => p.Id).ValueGeneratedNever();
            e.Property(p => p.DisplayName).HasMaxLength(60);
            e.Property(p => p.TeamName).HasMaxLength(40);
            e.Property(p => p.TeamColor).HasMaxLength(7);
            e.Property(p => p.Xp).HasDefaultValue(0);
            e.Property(p => p.Fur).HasMaxLength(24).HasDefaultValue("snow");
            e.Property(p => p.Outfit).HasMaxLength(24).HasDefaultValue("helmet");
            e.Property(p => p.Face).HasMaxLength(24).HasDefaultValue("none");
            e.Property(p => p.Frame).HasMaxLength(24).HasDefaultValue("wood");
        });

        modelBuilder.Entity<World>(e =>
        {
            e.ToTable("World");
            e.Property(w => w.Name).HasMaxLength(60);
            e.Property(w => w.Description).HasMaxLength(400);
        });

        modelBuilder.Entity<Weapon>(e =>
        {
            e.ToTable("Weapon");
            e.Property(w => w.Name).HasMaxLength(60);
            e.Property(w => w.Description).HasMaxLength(400);
        });

        modelBuilder.Entity<Match>(e =>
        {
            e.ToTable("Match");
            e.Property(m => m.Name).HasMaxLength(60);
            e.HasIndex(m => m.Token).IsUnique();
            e.HasIndex(m => m.Status);
            e.HasOne(m => m.World).WithMany().HasForeignKey(m => m.WorldId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(m => m.HostPlayer).WithMany().HasForeignKey(m => m.HostPlayerId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(m => m.Teams).WithOne(t => t.Match).HasForeignKey(t => t.MatchId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<MatchTeam>(e =>
        {
            e.ToTable("MatchTeam");
            e.Property(t => t.TeamName).HasMaxLength(40);
            e.Property(t => t.TeamColor).HasMaxLength(7);
            e.Property(t => t.Fur).HasMaxLength(24).HasDefaultValue("snow");
            e.Property(t => t.Outfit).HasMaxLength(24).HasDefaultValue("helmet");
            e.Property(t => t.Face).HasMaxLength(24).HasDefaultValue("none");
            e.Property(t => t.Frame).HasMaxLength(24).HasDefaultValue("wood");
            e.Property(t => t.XpGained).HasDefaultValue(0);
            e.HasOne(t => t.Player).WithMany().HasForeignKey(t => t.PlayerId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(t => new { t.MatchId, t.TeamIndex }).IsUnique();
        });

        modelBuilder.Entity<Setting>(e =>
        {
            e.ToTable("Setting");
            e.Property(s => s.Key).HasMaxLength(80);
            e.Property(s => s.Value).HasMaxLength(2000);
            e.HasIndex(s => s.Key).IsUnique();
        });
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        foreach (var entry in ChangeTracker.Entries<Entity>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreateDate = now;
                entry.Entity.CreateUserId = ActorId;
                entry.Entity.UpdateDate = now;
                entry.Entity.UpdateUserId = ActorId;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdateDate = now;
                entry.Entity.UpdateUserId = ActorId;
                if (entry.Entity is SoftDeleteEntity soft && soft.UpdateState != UpdateState.Deleted)
                {
                    soft.UpdateState = UpdateState.Updated;
                }
            }
        }

        return base.SaveChangesAsync(cancellationToken);
    }
}

/// <summary>How the plugin and the tools open the database: Npgsql, the migration history in the game's own schema.</summary>
public static class AppDatabase
{
    public static void Configure(DbContextOptionsBuilder options, string connectionString)
        => options.UseNpgsql(connectionString, npgsql => npgsql.MigrationsHistoryTable("__EFMigrationsHistory", AppDbContext.Schema));
}

/// <summary>For <c>dotnet ef migrations add</c> (no host needed): the local Postgres of MatGame's stack (port 2775).</summary>
public sealed class AppDbContextFactory : Microsoft.EntityFrameworkCore.Design.IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>();
        AppDatabase.Configure(options, Environment.GetEnvironmentVariable("BUNNYWARFARE_DESIGN_DB")
                                       ?? "Host=localhost;Port=2775;Database=matgame;Username=matgame;Password=matgame");
        return new AppDbContext(options.Options);
    }
}
