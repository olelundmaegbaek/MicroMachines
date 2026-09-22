# Bane 1: "Morgenbordet"

Én bane, ét omløb med uret, tre omgange. Bordet er 130 units bredt (X) og
70 units dybt (Z), med overfladen i `y = 0`. Kameraet ser skråt ned bagfra.

Vejbredden er 10 units som standard. Bilen er 1,8 bred, så det er knap seks
bilbredder. Enkelte passager snævrer ind til 7, og det er dér man mister
positionen.

## Omløbet, sektion for sektion

**1. Startstrækningen** · `z = +26`, fra `x = -45` til `x = +40`
Den lange lige langs bordets forkant. Start- og målporten fra legetøjsbanen står
her. Bred og tilgivende, så et løb altid begynder roligt.

**2. Tallerken-svinget** · `x ≈ +48`
Et hårdt højresving hele vejen rundt om en middagstallerken der ligger fladt på
bordet. Tallerkenen er en forhindring midt i svinget, ikke bare pynt, så linjen
er enten tæt indenom med hjulene på kanten af porcelænet eller bredt udenom.

**3. Skærebræts-plateauet** · langs `x ≈ +40`, nordgående
Vejen kører op på et træskærebræt, ca. 1 unit hævet, med en lille kant man
bumper over på vej op. Her snævrer vejen ind til 7 units.

**4. Kaffesøen** · ved udkørslen fra skærebrættet
En væltet kop og en pøl kaffe. **Lavt greb.** Den ligger med vilje lige hvor man
kommer ud af plateauet med fart på, så bagenden går.

**5. Rampen** · `z ≈ -10`, på tværs
Et stykke orange legetøjsbane på ben, som et rigtigt Hot Wheels-spor, står
ovenpå bordet. Man kører op ad et bakkestykke, får luft over toppen og lander
igen på bordpladen. Rampen er smallere end vejen, så det kræver at man rammer
den lige på. Man kan ikke falde ned i tomrum fra rampen, kun ned på bordet
igen.

**6. Melsporet** · `z ≈ -26`, langs bordets bagkant
En stribe spildt mel hele vejen langs bagkanten. **Meget lavt greb**, og
bordkanten ligger få units til venstre. Den korteste vej rundt er også den
eneste der kan koste dig hele løbet.

**7. Gryde-chikanen** · `x ≈ -48`
En gryde og en stegepande danner et tæt venstre-højre. Ingen plads til at være
dum, men fuldt muligt at køre rent.

**8. Bestik-sliden** · tilbage mod `z = +26`
Gafler, knive og skeer ligger spredt som små bump. De vælter ikke, men de
rykker i styretøjet, og så er man tilbage på startstrækningen.

## Regler for banen

- **Otte checkpoints**, ét pr. sektion. De skal passeres i rækkefølge, ellers
  tæller omgangen ikke. Det lukker genvejen hen over midten af bordet.
- **Falder man ud over bordkanten** falder bilen ned mod gulvet, og efter 1,5
  sekund sættes den tilbage på vejen ved sidste passerede checkpoint, i
  kørselsretningen og med farten sat til nul.
- **Grebs-zoner** defineres som polygoner med en gribefaktor. Bordplade er 1,0,
  skærebræt 1,05, kaffe 0,55, mel 0,4.
- **Bilerne kan skubbe hinanden.** Melsporet og tallerken-svinget er de to
  steder hvor et puf kan sende modstanderen ud over kanten.

## Hvorfor sådan

Micro Machines levede af at banen var et almindeligt bord man kendte, og at
faren var at køre ud over kanten, ikke at ramme en mur. Derfor ligger de to
farligste sektioner, melsporet og tallerken-svinget, klods op ad kanten, mens
resten af omløbet har god margin. Derfor er der heller ingen usynlige vægge:
kanten er kanten.

Rækkefølgen er også bygget som en rytme. Lang lige, hårdt sving, teknisk
passage, glat overraskelse, hop, risikabel genvej, chikane, og hjem. Man skal
nå at trække vejret mellem de to steder hvor man kan tabe løbet.
