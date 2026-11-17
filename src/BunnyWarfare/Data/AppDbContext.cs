using Microsoft.EntityFrameworkCore;

namespace BunnyWarfare.Data;

/// <summary>
/// The database (PostgreSQL). Tables and columns are PascalCase, every key is a bigint "Id".
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

    /// <summary>The player whose changes are saved (null = the system).</summary>
    public long? ActorId { get; private set; }

    public AppDbContext ActingAs(long? playerId)
    {
        ActorId = playerId;
        return this;
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Player>(e =>
        {
            e.ToTable("Player");
            e.Property(p => p.LoginName).HasMaxLength(40);
            e.Property(p => p.DisplayName).HasMaxLength(60);
            e.Property(p => p.TeamName).HasMaxLength(40);
            e.Property(p => p.TeamColor).HasMaxLength(7);
            e.Property(p => p.PasswordHash).HasMaxLength(200);
            e.Property(p => p.Xp).HasDefaultValue(0);
            e.Property(p => p.Fur).HasMaxLength(24).HasDefaultValue("snow");
            e.Property(p => p.Outfit).HasMaxLength(24).HasDefaultValue("helmet");
            e.Property(p => p.Face).HasMaxLength(24).HasDefaultValue("none");
            e.Property(p => p.Frame).HasMaxLength(24).HasDefaultValue("wood");
            e.HasIndex(p => p.LoginName).IsUnique();
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
