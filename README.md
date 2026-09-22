# MicroMachines

Et lille browser-bilspil i ånden fra det gamle *Micro Machines*: to legetøjsbiler
der drifter rundt mellem tallerkener og kaffekopper på et køkkenbord. To
spillere på ét tastatur, splitscreen, én bane, ingen computerstyrede modstandere.

**Spil det:** <https://olelundmaegbaek.github.io/MicroMachines/>

Bygget med Three.js, Vite og TypeScript. Ingen server, ingen konti, ingen
tracking. Det hele er en statisk side.

## Styring

| | Speeder | Bremse/bak | Venstre | Højre | Håndbremse |
|---|---|---|---|---|---|
| Spiller 1, øverst | `W` | `S` | `A` | `D` | venstre `Shift` |
| Spiller 2, nederst | `↑` | `↓` | `←` | `→` | højre `Shift` |

I menuerne vælger man med venstre og højre, bekræfter med speederen og fortryder
med bremsen. `M` slår lyden fra. `F3` viser tal for de nysgerrige.

Riv i håndbremsen midt i et sving. Det er hele pointen.

## Bilerne

**Soba Supreme** · orange-rød · lang næse, stor vinge, og en bagende der gerne
vil ud at køre for sig selv.

**Porcini 911** · sandfarvet · kort, bred og stædig. Motoren sidder bagi, og det
kan mærkes i svingene.

De to biler **kører fuldstændig ens**. Forskellen er karrosseriet og farven.
I et spil hvor to mennesker deler ét tastatur og ingen kan vælge om, skal ingen
kunne vælge forkert. Vælger begge den samme bil, får de hver sin farve.

## Banen

"Morgenbordet", tre omgange. Start på den lange lige langs forkanten, forbi
spredt bestik, gennem en chikane af en gryde og en pande, og så det farlige
stykke: et spor af spildt mel langs bagkanten hvor vejgrebet er det halve og
bordkanten er tre units væk. Derefter op ad en rampe af orange legetøjsbane,
gennem en kaffepøl, op på et skærebræt, og hjem gennem et skarpt sving rundt om
en middagstallerken.

Der er ingen usynlige vægge. Kanten er kanten, og du kan skubbe modstanderen ud
over den. Falder du ned, står du på banen igen efter halvandet sekund.

En omgang tager omkring ni sekunder.

Banens geometri er regnet efter frem for tegnet i frihånd, og det er
dokumenteret i [`docs/TRACK.md`](docs/TRACK.md) sammen med begrundelsen.
[`docs/UI.md`](docs/UI.md) gør det samme for skærmbillederne.

## Kør det selv

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typetjek + produktionsbuild i dist/
```

## Licens

Koden er MIT. Alle medfølgende grafik-assets er CC0 og dokumenteret i
[`public/assets/CREDITS.md`](public/assets/CREDITS.md). Al lyd er syntetiseret i
Web Audio, så der er ingen lydfiler overhovedet.

Bilerne er opdigtede legetøjsbiler. Enhver lighed med rigtige biler er ren
karosseri-poesi.
