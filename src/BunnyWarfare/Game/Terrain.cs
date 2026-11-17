namespace BunnyWarfare.Game;

/// <summary>A 3D vector of the simulation (metres; y is up).</summary>
public readonly record struct V3(double X, double Y, double Z)
{
    public static V3 operator +(V3 a, V3 b) => new(a.X + b.X, a.Y + b.Y, a.Z + b.Z);

    public static V3 operator -(V3 a, V3 b) => new(a.X - b.X, a.Y - b.Y, a.Z - b.Z);

    public static V3 operator *(V3 a, double s) => new(a.X * s, a.Y * s, a.Z * s);

    public double Length => Math.Sqrt(X * X + Y * Y + Z * Z);

    public double Dot(V3 o) => X * o.X + Y * o.Y + Z * o.Z;

    public V3 Normalized()
    {
        var l = Length;
        return l < 1e-9 ? new V3(0, 1, 0) : new V3(X / l, Y / l, Z / l);
    }

    public double DistanceTo(V3 o) => (this - o).Length;
}

/// <summary>
/// The island: a square height map of <see cref="Size"/> x <see cref="Size"/> points, <see cref="CellSize"/> apart, from (0, 0) to (Width, Width).
/// Heights are float32, exactly as the browser keeps them, so a crater the browser digs with the same formula ends up the same.
/// </summary>
public sealed class Terrain
{
    public const double CellSize = 0.5;

    /// <summary>Below the island there is nothing but water (or space).</summary>
    public const double Abyss = -12;

    /// <summary>Craters never dig deeper than this.</summary>
    public const double Bedrock = -6;

    public Terrain(int size, float[] heights, double waterLevel)
    {
        Size = size;
        Heights = heights;
        WaterLevel = waterLevel;
    }

    public int Size { get; }

    public float[] Heights { get; }

    public double WaterLevel { get; }

    public double Width => (Size - 1) * CellSize;

    public Terrain Clone() => new(Size, (float[])Heights.Clone(), WaterLevel);

    public bool Inside(double x, double z) => x >= 0 && z >= 0 && x <= Width && z <= Width;

    /// <summary>The height of the ground at a point (bilinear); outside the map the abyss.</summary>
    public double HeightAt(double x, double z)
    {
        if (!Inside(x, z))
        {
            return Abyss;
        }

        var gx = x / CellSize;
        var gz = z / CellSize;
        var ix = Math.Min((int)gx, Size - 2);
        var iz = Math.Min((int)gz, Size - 2);
        var fx = gx - ix;
        var fz = gz - iz;
        double h00 = Heights[iz * Size + ix], h10 = Heights[iz * Size + ix + 1];
        double h01 = Heights[(iz + 1) * Size + ix], h11 = Heights[(iz + 1) * Size + ix + 1];
        return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
    }

    /// <summary>The normal of the ground at a point (central differences).</summary>
    public V3 NormalAt(double x, double z)
    {
        const double e = CellSize;
        var dx = HeightAt(x + e, z) - HeightAt(x - e, z);
        var dz = HeightAt(x, z + e) - HeightAt(x, z - e);
        return new V3(-dx, 2 * e, -dz).Normalized();
    }

    /// <summary>The steepness of the ground (0 = flat, 1 = 45°, more = steeper).</summary>
    public double SlopeAt(double x, double z)
    {
        var n = NormalAt(x, z);
        return Math.Sqrt(n.X * n.X + n.Z * n.Z) / Math.Max(0.05, n.Y);
    }

    /// <summary>Digs a spherical crater: every point of the ground inside the sphere sinks to its lower surface.</summary>
    public void Crater(V3 center, double radius)
    {
        var minX = Math.Max(0, (int)Math.Floor((center.X - radius) / CellSize));
        var maxX = Math.Min(Size - 1, (int)Math.Ceiling((center.X + radius) / CellSize));
        var minZ = Math.Max(0, (int)Math.Floor((center.Z - radius) / CellSize));
        var maxZ = Math.Min(Size - 1, (int)Math.Ceiling((center.Z + radius) / CellSize));
        var r2 = radius * radius;
        for (var iz = minZ; iz <= maxZ; iz++)
        {
            for (var ix = minX; ix <= maxX; ix++)
            {
                var dx = ix * CellSize - center.X;
                var dz = iz * CellSize - center.Z;
                var d2 = dx * dx + dz * dz;
                if (d2 >= r2)
                {
                    continue;
                }

                var bottom = (float)Math.Max(Bedrock, center.Y - Math.Sqrt(r2 - d2));
                var i = iz * Size + ix;
                if (Heights[i] > bottom)
                {
                    Heights[i] = bottom;
                }
            }
        }
    }

    /// <summary>The heights as base64 of little-endian float32 (what the browser reads into a Float32Array).</summary>
    public string ToBase64()
    {
        var bytes = new byte[Heights.Length * 4];
        Buffer.BlockCopy(Heights, 0, bytes, 0, bytes.Length);
        if (!BitConverter.IsLittleEndian)
        {
            for (var i = 0; i < bytes.Length; i += 4)
            {
                Array.Reverse(bytes, i, 4);
            }
        }

        return Convert.ToBase64String(bytes);
    }

    /// <summary>
    /// Generates an island from a seed: fractal value noise, shaped by a falloff so the edges sink into the water.
    /// The same parameters always give the same island.
    /// </summary>
    public static Terrain Generate(int size, int seed, double hillHeight, double roughness, double waterLevel)
    {
        var heights = new float[size * size];
        var persistence = 0.35 + 0.3 * Math.Clamp(roughness, 0, 1);
        var basePeriod = Math.Max(8.0, size / 3.2);
        var center = (size - 1) / 2.0;
        for (var iz = 0; iz < size; iz++)
        {
            for (var ix = 0; ix < size; ix++)
            {
                double n = 0, amplitude = 1, total = 0, period = basePeriod;
                for (var octave = 0; octave < 5; octave++)
                {
                    n += amplitude * ValueNoise(seed + octave * 1013, ix / period, iz / period);
                    total += amplitude;
                    amplitude *= persistence;
                    period /= 2;
                }

                n /= total;

                // distance from the middle, 0 in the middle and 1 at the edge (a rounded square)
                var dx = Math.Abs(ix - center) / center;
                var dz = Math.Abs(iz - center) / center;
                var d = Math.Pow(Math.Pow(dx, 4) + Math.Pow(dz, 4), 0.25);
                var mask = SmoothStep(0.98, 0.62, d);

                var land = 0.7 + hillHeight * Math.Pow(Math.Max(0, n * 1.25 - 0.18), 1.35);
                var h = waterLevel + mask * land - (1 - mask) * 3.5;
                heights[iz * size + ix] = (float)h;
            }
        }

        return new Terrain(size, heights, waterLevel);
    }

    private static double SmoothStep(double edge0, double edge1, double x)
    {
        var t = Math.Clamp((x - edge0) / (edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    }

    private static double ValueNoise(int seed, double x, double z)
    {
        var x0 = (int)Math.Floor(x);
        var z0 = (int)Math.Floor(z);
        var fx = x - x0;
        var fz = z - z0;
        var sx = fx * fx * (3 - 2 * fx);
        var sz = fz * fz * (3 - 2 * fz);
        var a = Lattice(seed, x0, z0);
        var b = Lattice(seed, x0 + 1, z0);
        var c = Lattice(seed, x0, z0 + 1);
        var d = Lattice(seed, x0 + 1, z0 + 1);
        return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
    }

    /// <summary>A random number in [0, 1) for a point of the lattice (an integer hash; the same on every machine).</summary>
    private static double Lattice(int seed, int x, int z)
    {
        unchecked
        {
            var h = (uint)seed * 0x9E3779B1u;
            h ^= (uint)x * 0x85EBCA77u;
            h = (h << 13) | (h >> 19);
            h ^= (uint)z * 0xC2B2AE3Du;
            h *= 0x27D4EB2Fu;
            h ^= h >> 15;
            h *= 0x165667B1u;
            h ^= h >> 13;
            return (h & 0xFFFFFF) / (double)0x1000000;
        }
    }
}
