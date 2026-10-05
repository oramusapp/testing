# Pokrycie notatek i zdjęć (TRW Crypto Investing Masterclass + sygnały)

Status: **W** = wdrożone w aplikacji · **T** = przetestowane i odrzucone (wynik w README) · **R** = ręczne z założenia (makro/TA/jakościowe) ·
**N** = nie do zrobienia (brak danych/treści) · **K** = koncepcyjne (sposób myślenia, bez reguły do policzenia).

| Sekcja notatek / slajdy | Co zawiera | Status | Gdzie |
|---|---|---|---|
| Signals intro, SDCA (Adam's signal) | SDCA = akumulacja/dystrybucja wg wyceny | W | SDCA |
| TPI: definicja, stany > 0 / < 0, rosnący/malejący | 3 wymiary sygnału, wskazówki | W | LTPI · MTPI (stan, ROC, zgodność), próg 0 domyślnie |
| „The TPI is built for $TOTAL” | TPI na całym rynku | W | LTPI/MTPI liczone z $TOTAL (indeks 45 aktywów Coin Metrics, run44) |
| TPI poniżej zera i spada → rozważ short | short | W | propozycja shortu przy MTPI < 0 i ROC < 0 |
| RSPS: benchmark $TOTAL | porównanie | W | Backtest: linia $TOTAL kup i trzymaj |
| TPI × reżim (slajd 005) | dźwignia 2× tylko LTPI+ MTPI+ i trend; spot przy konsolidacji | W | Macierz decyzji (LTPI · MTPI), dźwignia tylko propozycja |
| RSPS (podstawowy/zaawansowany) | rotacja siły względnej, bramka | W | RSPS |
| Signal definitions / execution guides | wykonanie, rebalans | W | Portfel |
| Islamic finance, leveraged tokens, signal objections/mindset | zasady osobiste | K | — |
| Statystyka: SD, z, 68-95-99,7, tablice z (006–014, 037, 039) | wzory | W | Inne → Statystyka |
| Korelacja, wykresy rozrzutu, odstające (015–024, 038) | r, Spearman, wpływ odstających | W | Statystyka (korelacja, odstające) |
| F&G → zwrot 20 d (018), F&G < 12 (059) | krzywa U | W | RSPS → Badania (sentyment, zdarzenia) |
| Google Trends (025), Lunacy (028), Smart/Dumb (054) | sentyment | R | Piramida · sentyment (rubryka) |
| Regresje, kanały, przeuczenie, krzywe (026–034, 040–041) | regresja, ±σ, stopień | W/T | Statystyka; stopień 2 modelu SDCA (run27) |
| Q-Q, dekompozycja, histogram (021, 035, 036) | rozkłady | W | Statystyka |
| Stożek prawdopodobieństwa (042–044) | wartość × trend | W | SDCA → stożek (run30–31) |
| Uznaniowa TA: formacje, Fibonacci, linie, świece (045–052) | TA | T/W | run32: brak przewagi; filar TA liczony automatycznie (run42) |
| Badania zdarzeń OddStats/SentimenTrader (056–059) | zdarzenia, z ≥ 2 | W | RSPS → badanie zdarzeń (run34); breadth thrust krypto T (run43) |
| On-chain: HODL waves, illiquid supply, Realized Loss, Accumulation Trend (058, 060, 061, 064, 071) | on-chain płatne | N | brak darmowych danych (Glassnode) |
| Wzory on-chain (062): NUPL, MVRV Z, Puell, RHODL, Reserve Risk, NVTS | wycena | W/T | arkusz wyceny: 5 liczonych auto; jako składniki composite T (run35) |
| 42 Macro GRID (063, 065–069, 170) | reżim makro | R | LTPI · MTPI → Makro (karta GRID) |
| Metcalfe, S2F, podaż (072–077, 080, 020) | fundamenty | T | run26 (regresja podaży) |
| Systematyzacja, hierarchia analiz (076, 078, 081) | piramida | W | Piramida (filary, równe wagi z-score) |
| MPT/PMPT/UPT: Sharpe, Sortino, Omega, granica efektywna (082–095, 126–127, 152–155) | miary | W/T | tabela MPT; ranking Omega i SUPT T |
| Cykl długoterminowy (096): SDCA → LSI w trendzie → DCA → sprzedaż | fazy | W | tempo zakupów × 0,25 przy LTPI−, pełna krzywa przy LTPI+ (run40–41) |
| Dźwignia tylko na dnie (097) | dźwignia | T | macierz dźwigni odrzucona; tylko propozycja |
| Beta wg fazy (098, 069) | rotacja bety | T | run38 (wg wyceny), GRID: opis „najpierw wysoka beta” |
| Halving: cykl, czas do szczytu 767–884 d (100–104) | zegar cyklu | W | SDCA → Szczegóły modelu (zegar halvingu) |
| Wycena: wskaźniki, z-score, alpha decay (105, 113–116, 130) | arkusz | W | arkusz wyceny; detrend vs surowe (run35) |
| CBBI, komponenty (108, 110–112) | agregat | R | arkusz wyceny (CBBI ręcznie, ostrzeżenie o komponentach) |
| Tempo akumulacji: 114 ± 32 d, regresja faz 145 ± 27 (109) | kalkulator | W | SDCA → narzędzia (oba warianty) |
| Tempo dystrybucji: ATH dni, harmonogramy (117–119) | sprzedaż przy ATH | W | propozycja + powiadomienie (run36–37) |
| NUPL strefy, zysk netto (120) | presja sprzedaży | W | NUPL auto w arkuszu |
| Model hiperboliczny, „Hype-to-FOMO” (121–122) | scenariusz ogona | K | tylko ostrzeżenie (sprzedaż 90/10 T) |
| Długoterminowy bull/bear −1…+1 (123) | wskaźnik | W | LTPI |
| Wielkości i czasy rajdów (124–125, 135, 137) | oczekiwania | K | stożek wyników |
| Średni termin: horyzonty, kotwica, hierarchia interwałów | czas | K/W | MTPI/LTPI na 1D |
| Long/short trendu (136, 138, 139) | short | T | run39: short pogarsza wynik |
| Agregacja ręczna, dywersyfikacja tematów, spójność czasowa (140–145) | TPI | W/N | zmiany/rok przy składnikach; wejścia makro (SPX, TLT, złoto) N — brak danych w aplikacji |
| Wynik trendu: osłabienie jako ostrzeżenie (146–149) | ROC | W | ROC 5 dni w TPI |
| Strategie algorytmiczne, SUPT, pułapki (147–157) | TV | T/K | SUPT T; strategie TradingView poza zakresem |
| FTX, macierz oczekiwanej straty (158–161) | ryzyko kontrahenta | K | — |
| Cykl kredytowy HY (159), płynność globalna z opóźnieniami (169) | makro | N | FRED/CrossBorder niedostępne; M2 miesięcznie T |
| Speculative breakout (162) | ręczne poziomy + FSVZO/STC/DSMA | R/N | wymaga ręcznie rysowanych poziomów |
| Sezonowość (163–168) | wiatr w plecy | W/T | karta sezonowości; filtr T (run29) |
| Kelly | tylko tytuł | W | Statystyka → Kelly (wzory standardowe) |
| On-chain płatne, cykl kredytowy, płynność, korelacje makro, TOTAL/wolumen w TA | dane niedostępne w aplikacji | R | ręczne uzupełnienie w Piramidzie: link + jak liczyć + plus/minus |
| Podatki, „jak nie rebalansować” | tylko tytuł | W/K | pasmo ±10 p.p. ogranicza rebalanse |
| Qualitative alpha #1–#11 | narracje, zespół, tokenomia | R | Piramida · fundamenty (rubryka) |
| CACRI, Shorter Term Trading, Post-Grad | tylko nagłówki | N | brak treści |
