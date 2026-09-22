# Assets

Everything here is **CC0 1.0** (public domain). None of it requires attribution,
but the sources are recorded so the files can be re-fetched or updated.

## `cars/` — Kenney "Car Kit" v3.1

<https://kenney.nl/assets/car-kit>

`sedan-sports.glb`, `hatchback-sports.glb`, `wheel-racing.glb`,
`wheel-default.glb`, `wheel-dark.glb`.

The car bodies expose named nodes (`body`, `spoiler`, `wheel-front-left`,
`wheel-front-right`, `wheel-back-left`, `wheel-back-right`), which is why this
kit was chosen over the Toy Car Kit: the wheels can be steered and spun
independently of the body.

## `props/` — Kenney "Food Kit" v2.0

<https://kenney.nl/assets/food-kit>

Plates, bowls, cups, pots, pans, bottles, cutlery and food. These are the
obstacles and scenery on the kitchen table.

## `track/` — Kenney "Toy Car Kit" v1.2

<https://kenney.nl/assets/toy-car-kit>

The orange plastic toy-track pieces, their supports, and the start/finish gates.
Used for the ramp and jump section, where the route leaves the table surface and
runs over a piece of toy track.

## `textures/` — Poly Haven "wood_table_001"

<https://polyhaven.com/a/wood_table_001>

1K JPEG diffuse, normal (OpenGL convention) and roughness maps for the table
top.

## Texture paths — do not flatten this folder

Each Kenney kit ships one shared `Textures/colormap.png` that every model in the
kit samples, and the GLB files reference it as an **external** relative URI
(`Textures/colormap.png`), not as embedded image data. Each kit therefore keeps
its own `Textures/` subfolder next to its models. Move a `.glb` without its
sibling `Textures/` folder and `GLTFLoader` will 404 the image and render the
model untextured white.

One shared colormap per kit also means one texture binding for the whole kit,
which is why the models are cheap to draw.
