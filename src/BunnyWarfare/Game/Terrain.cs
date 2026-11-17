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
    /// Generates an island from a seed. The coast is a domain-warped noise shape (bays, capes, a few islets), the shore is a beach in most
    /// places and a cliff in some, the inland has hills by fractal noise, and the theme adds its own landform: a pond on the meadow,
    /// ridged peaks in the snow, wind-blown dunes in the desert, impact craters on the moon. The outer cells of the map are always deep
    /// under the water, so the island never touches the border. The same parameters always give the same island.
    /// </summary>
    public static Terrain Generate(int size, int seed, double hillHeight, double roughness, double waterLevel, Data.WorldTheme theme = Data.WorldTheme.Meadow,
        List<Landmark>? landmarks = null)
    {
        var heights = new float[size * size];
        var rough = Math.Clamp(roughness, 0, 1);
        var persistence = 0.38 + 0.25 * rough;
        var center = (size - 1) / 2.0;
        var random = new Random(seed);
        var duneAngle = random.NextDouble() * Math.PI;
        var pond = (X: center + (random.NextDouble() - 0.5) * size * 0.3, Z: center + (random.NextDouble() - 0.5) * size * 0.3, R: size * (0.06 + random.NextDouble() * 0.025));
        var craters = Enumerable.Range(0, theme == Data.WorldTheme.Moon ? 5 + random.Next(4) : 0)
            .Select(_ => (X: center + (random.NextDouble() - 0.5) * size * 0.7, Z: center + (random.NextDouble() - 0.5) * size * 0.7, R: size * (0.04 + random.NextDouble() * 0.07)))
            .ToList();
        // the volcano: a cone with a caldera near the middle of the island
        var vent = (X: center + (random.NextDouble() - 0.5) * size * 0.12, Z: center + (random.NextDouble() - 0.5) * size * 0.12, R: size * 0.27);
        pond.R *= theme switch { Data.WorldTheme.Autumn => 0.8, Data.WorldTheme.Jungle => 1.3, _ => 1.0 };

        for (var iz = 0; iz < size; iz++)
        {
            for (var ix = 0; ix < size; ix++)
            {
                // -1..1 across the map
                var nx = (ix - center) / center;
                var nz = (iz - center) / center;

                // the coast: a warped, lumpy circle
                var wx = nx + 0.34 * (Fbm(seed + 11, nx * 1.7 + 3, nz * 1.7, 3, 0.5) - 0.5);
                var wz = nz + 0.34 * (Fbm(seed + 17, nx * 1.7, nz * 1.7 + 5, 3, 0.5) - 0.5);
                var shape = 0.66 - Math.Sqrt(wx * wx + wz * wz) + 0.38 * (Fbm(seed + 23, nx * 2.4, nz * 2.4, 4, 0.5) - 0.5);

                // never land near the border of the map: the outer 9 cells always lie under the water, the outer 6 at least 4 m deep
                var border = Math.Min(Math.Min(ix, iz), Math.Min(size - 1 - ix, size - 1 - iz));
                // (the limit itself wavers, so a coast that reaches it does not run along a straight line)
                shape = Math.Min(shape, (border - 9 + 7 * (ValueNoise(seed + 61, ix / 6.0, iz / 6.0) - 0.5)) / (size * 0.14));

                double h;
                if (shape <= 0)
                {
                    // the sea floor: shallow near the coast, then deep
                    var depth = SmoothStep(0, 0.22, -shape);
                    h = waterLevel - 0.5 - depth * 4.8 + 0.4 * (ValueNoise(seed + 31, ix / 5.0, iz / 5.0) - 0.5);
                }
                else
                {
                    // hills
                    double n = 0, amplitude = 1, total = 0, period = Math.Max(8.0, size / 3.4);
                    for (var octave = 0; octave < 5; octave++)
                    {
                        n += amplitude * ValueNoise(seed + octave * 1013, ix / period, iz / period);
                        total += amplitude;
                        amplitude *= persistence;
                        period /= 2;
                    }

                    n /= total;
                    var inland = SmoothStep(0.02, 0.32, shape);
                    var relief = theme switch
                    {
                        // sharp ridges between soft valleys
                        Data.WorldTheme.Snow => 0.55 * n + 0.45 * Ridged(seed + 41, ix / (size / 3.0), iz / (size / 3.0)),

                        // dunes across the wind, on a gentle swell
                        Data.WorldTheme.Desert => 0.55 * n + 0.45 * (0.5 + 0.5 * Math.Sin((ix * Math.Cos(duneAngle) + iz * Math.Sin(duneAngle)) / 4.2 + 5 * n)),

                        // big round hills
                        Data.WorldTheme.Autumn => 0.6 * n + 0.4 * Fbm(seed + 81, ix / (size / 2.6), iz / (size / 2.6), 2, 0.5),

                        // steep jungle hills with deep valleys
                        Data.WorldTheme.Jungle => 0.62 * n + 0.38 * Ridged(seed + 43, ix / (size / 2.4), iz / (size / 2.4)),

                        // rough lava fields around the cone
                        Data.WorldTheme.Volcano => 0.7 * n + 0.3 * Ridged(seed + 47, ix / (size / 4.0), iz / (size / 4.0)),
                        _ => n,
                    };
                    var hills = hillHeight * Math.Pow(Math.Max(0, relief * 1.3 - 0.2), 1.25) * inland;

                    // the shore: a beach that rises gently, or (where the noise says so) a cliff
                    var cliffBias = theme switch { Data.WorldTheme.Volcano => -0.1, Data.WorldTheme.Jungle => -0.05, _ => 0.0 };
                    var cliff = SmoothStep(0.58 + cliffBias, 0.72 + cliffBias, ValueNoise(seed + 53, ix / 14.0, iz / 14.0)) * (theme == Data.WorldTheme.Desert ? 0.4 : 1);
                    var beach = 0.15 + 0.9 * SmoothStep(0, 0.16, shape);
                    var rim = 0.15 + Math.Min(1, shape / 0.04) * (1.8 + hillHeight * 0.18);
                    var shore = beach * (1 - cliff) + rim * cliff;
                    h = waterLevel + shore + hills;

                    // the cone of the volcano, with a caldera at its top
                    if (theme == Data.WorldTheme.Volcano)
                    {
                        var dv = Math.Sqrt((ix - vent.X) * (ix - vent.X) + (iz - vent.Z) * (iz - vent.Z)) / vent.R;
                        if (dv < 1)
                        {
                            var coneHeight = hillHeight * 0.9 + 5;
                            const double caldera = 0.22;
                            var q = dv / caldera;
                            // the caldera: a bowl with a wide flat floor (for the lava pool) and steep walls
                            var cone = dv >= caldera ? coneHeight * Math.Pow(1 - dv, 1.6) : coneHeight * Math.Pow(1 - caldera, 1.6) - 2.6 * (1 - q * q * q * q);
                            // the cone is smooth near its top (no hills on it), so the caldera is a clean bowl
                            h += cone * inland - hills * (1 - SmoothStep(0.12, 0.6, dv));
                        }
                    }

                    // ledges in the snow
                    if (theme == Data.WorldTheme.Snow && inland > 0.5)
                    {
                        const double step = 1.6;
                        var level = Math.Floor((h - waterLevel) / step) * step + waterLevel;
                        h = h + (level + step * SmoothStep(0.15, 0.85, (h - level) / step) - h) * 0.35 * inland;
                    }
                }

                // a pond on the meadow, in the autumn wood and in the jungle (under the waterfall)
                if (theme is Data.WorldTheme.Meadow or Data.WorldTheme.Autumn or Data.WorldTheme.Jungle)
                {
                    var d = Math.Sqrt((ix - pond.X) * (ix - pond.X) + (iz - pond.Z) * (iz - pond.Z)) / pond.R * (1 + 0.55 * (Fbm(seed + 71, ix / 7.0, iz / 7.0, 2, 0.5) - 0.5));
                    if (d < 3.2 && h > waterLevel)
                    {
                        // a shallow bowl, and around it the land sinks gently to a flat bank (no steep walls)
                        var bowl = waterLevel - 0.7 * (1 - Math.Min(1, d * d));
                        h = d < 1 ? Math.Min(h, bowl) : h + (waterLevel + 0.25 + 0.35 * (d - 1) - h) * SmoothStep(3.2, 1, d);
                    }
                }

                // impact craters on the moon: a bowl with a raised rim
                foreach (var c in craters)
                {
                    var d = Math.Sqrt((ix - c.X) * (ix - c.X) + (iz - c.Z) * (iz - c.Z)) / c.R;
                    if (d < 1.5 && h > waterLevel)
                    {
                        h += d < 1 ? -1.6 * (1 - d * d) : 0.9 * Math.Sin((d - 1) / 0.5 * Math.PI) * (1 - (d - 1) / 0.5);
                    }
                }

                heights[iz * size + ix] = (float)Math.Clamp(h, Bedrock, waterLevel + 22);
            }
        }

        CarveLandmarks(heights, size, waterLevel, seed, theme, landmarks);
        return new Terrain(size, heights, waterLevel);
    }

    /// <summary>A landmark carved into the island (grid cells, inclusive): a cave notch or the temple terrace. Its floor is one exact float32 value.</summary>
    public sealed record Landmark(string Kind, int MinX, int MinZ, int MaxX, int MaxZ, float Floor);

    /// <summary>The landmarks of the island (where caves and the temple are). Same parameters, same landmarks.</summary>
    public static IReadOnlyList<Landmark> LandmarksOf(int size, int seed, double hillHeight, double roughness, double waterLevel, Data.WorldTheme theme)
    {
        var landmarks = new List<Landmark>();
        Generate(size, seed, hillHeight, roughness, waterLevel, theme, landmarks);
        return landmarks;
    }

    /// <summary>
    /// Carves the landmarks after the relief: cave notches into hillsides (every theme where a hill is high enough; two on big maps) and, in the
    /// jungle, a flat terrace for the temple. Their floors are exactly flat (one float32 value over many cells): the browser finds them by that
    /// and puts the rock arch of the cave mouth or the temple onto them. A cave is a dead end a bunny can walk into: a level approach, a flat
    /// floor, walls on three sides that are higher than a bunny.
    /// </summary>
    private static void CarveLandmarks(float[] heights, int size, double waterLevel, int seed, Data.WorldTheme theme, List<Landmark>? found = null)
    {
        var landmarks = found ?? [];
        var random = new Random(unchecked(seed * 31 + 7));
        float At(int x, int z) => heights[z * size + x];
        bool FarFromOthers(int x, int z) => landmarks.All(l => Math.Abs((l.MinX + l.MaxX) / 2 - x) + Math.Abs((l.MinZ + l.MaxZ) / 2 - z) > 22);

        if (theme == Data.WorldTheme.Jungle)
        {
            const int half = 7;
            for (var attempt = 0; attempt < 1500; attempt++)
            {
                var cx = random.Next(18, size - 18);
                var cz = random.Next(18, size - 18);
                var floor = At(cx, cz);
                if (floor < waterLevel + 0.8 || floor > waterLevel + 6)
                {
                    continue;
                }

                var fits = true;
                for (var z = cz - half - 3; z <= cz + half + 3 && fits; z++)
                {
                    for (var x = cx - half - 3; x <= cx + half + 3 && fits; x++)
                    {
                        var h = At(x, z);
                        fits = h > waterLevel + 0.4 && Math.Abs(h - floor) < 3.2;
                    }
                }

                if (!fits)
                {
                    continue;
                }

                // the terrace, and around it a ramp of three cells to the land
                for (var z = cz - half - 3; z <= cz + half + 3; z++)
                {
                    for (var x = cx - half - 3; x <= cx + half + 3; x++)
                    {
                        var ring = Math.Max(Math.Abs(x - cx), Math.Abs(z - cz));
                        var i = z * size + x;
                        heights[i] = ring <= half ? floor : (float)(heights[i] + (floor - heights[i]) * SmoothStep(half + 3.5, half, ring));
                    }
                }

                landmarks.Add(new Landmark("temple", cx - half, cz - half, cx + half, cz + half, floor));
                break;
            }
        }

        // caves: a rocky hill is raised behind a level spot and a notch is cut into it, so every island gets its caves (not only where a
        // hillside happens to fit)
        (int X, int Z)[] directions = [(1, 0), (-1, 0), (0, 1), (0, -1)];
        const int length = 9, width = 2;
        var (shoulder, falloff) = size < 80 ? (4, 3) : (5, 4);
        var wanted = size >= 100 ? 2 : 1;
        var caves = 0;
        for (var attempt = 0; attempt < 4000 && caves < wanted; attempt++)
        {
            var ex = random.Next(12, size - 12);
            var ez = random.Next(12, size - 12);
            var (dx, dz) = directions[random.Next(4)];
            var floor = At(ex, ez);
            if (floor < waterLevel + 0.6 || floor > waterLevel + 7 || !FarFromOthers(ex + dx * length / 2, ez + dz * length / 2))
            {
                continue;
            }

            // a level approach in front, and the whole hill on land (not into the sea, not up a cliff, inside the map)
            var ok = true;
            for (var k = -3; k <= length + 1 + falloff && ok; k++)
            {
                var reach = k < 0 ? 1 : shoulder + falloff;
                for (var w = -reach; w <= reach && ok; w++)
                {
                    var x = ex + dx * k + dz * w;
                    var z = ez + dz * k + dx * w;
                    if (x < 8 || z < 8 || x > size - 9 || z > size - 9)
                    {
                        ok = false;
                        break;
                    }

                    var h = At(x, z);
                    ok = k < 0 ? Math.Abs(h - floor) < (k == -1 ? 0.3 : 0.6) && h > waterLevel + 0.3 : h > waterLevel + 0.35 && (k > 2 || h > floor - 0.6); // behind the mouth anything goes: a higher hill only makes the walls higher
                }
            }

            if (!ok)
            {
                continue;
            }

            // the hill: walls 2.6–3.2 m above the floor around the notch, sinking softly to the land outside
            var top = floor + 2.6 + 0.6 * ValueNoise(seed + 97, ex / 3.0, ez / 3.0);
            int minX = int.MaxValue, minZ = int.MaxValue, maxX = 0, maxZ = 0;
            for (var k = 0; k <= length + 1 + falloff; k++)
            {
                for (var w = -shoulder - falloff; w <= shoulder + falloff; w++)
                {
                    var x = ex + dx * k + dz * w;
                    var z = ez + dz * k + dx * w;
                    // distance outside the core of the hill (the core reaches from the mouth to the back wall, shoulder cells to each side)
                    var outK = Math.Max(0, k - (length + 1));
                    var outW = Math.Max(0, Math.Abs(w) - shoulder);
                    var outside = Math.Sqrt(outK * outK + outW * outW);
                    var lump = 0.35 * (ValueNoise(seed + 101, x / 2.5, z / 2.5) - 0.5);
                    var mouth = k == 0 ? 0.55 : k == 1 ? 0.8 : 1.0; // the hill dips a little towards the mouth
                    var raised = floor + (top - floor + lump) * mouth * SmoothStep(falloff, 0, outside);
                    var i = z * size + x;
                    if (raised > heights[i])
                    {
                        heights[i] = (float)raised;
                    }
                }
            }

            for (var k = 0; k <= length; k++)
            {
                for (var w = -width; w <= width; w++)
                {
                    var x = ex + dx * k + dz * w;
                    var z = ez + dz * k + dx * w;
                    heights[z * size + x] = floor;
                    minX = Math.Min(minX, x);
                    minZ = Math.Min(minZ, z);
                    maxX = Math.Max(maxX, x);
                    maxZ = Math.Max(maxZ, z);
                }
            }

            landmarks.Add(new Landmark("cave", minX, minZ, maxX, maxZ, floor));
            caves++;
        }
    }
    private static double Fbm(int seed, double x, double z, int octaves, double persistence)
    {
        double n = 0, amplitude = 1, total = 0, frequency = 1;
        for (var o = 0; o < octaves; o++)
        {
            n += amplitude * ValueNoise(seed + o * 7919, x * frequency, z * frequency);
            total += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }

        return n / total;
    }

    /// <summary>Ridged noise: sharp crests where the noise crosses its middle.</summary>
    private static double Ridged(int seed, double x, double z)
    {
        var r = 1 - Math.Abs(2 * Fbm(seed, x, z, 4, 0.5) - 1);
        return r * r;
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
