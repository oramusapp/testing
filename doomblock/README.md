# DoomBlock – blokada doomscrollingu (Instagram Rolki + TikTok „Dla Ciebie”)

Prywatny skrypt do Safari na iPhonie. Nie jest przeznaczony do dystrybucji.

**Co robi:**
- **Instagram:** feed Rolek (`/reels/…`) od razu przekierowuje na stronę główną, a przycisk Rolek jest schowany.
  Pojedyncza rolka z linku albo wiadomości (`/reel/<id>`) dalej się otwiera.
- **TikTok:** strona główna i „Dla Ciebie” (`/`, `/foryou`, `/en/…`) oraz `/explore` są zasłonięte ekranem blokady, a wideo w tle jest pauzowane.
  Profile, wyszukiwarka, wiadomości i pojedyncze filmy z linków działają.
- Nie dotyka żadnych innych stron. Nic nie wysyła i nie zbiera danych.

**Ważne:** skrypt działa tylko w **Safari**, a nie w aplikacjach Instagram i TikTok. Aplikacji iOS nie da się w ten sposób zmodyfikować.
Dlatego w kroku 3 blokujesz same aplikacje w Czasie przed ekranem.

Ustawienia są na górze pliku `extension/content.js`, w obiekcie `CONFIG`.
Można tam np. zablokować także Eksploruj na IG albo pojedyncze filmy na TikToku.

---

## Sposób 1 (polecany): aplikacja „Userscripts” – bez Maca, bez wygasania

Darmowa aplikacja open source: [App Store](https://apps.apple.com/us/app/userscripts/id1463298887), [GitHub](https://github.com/quoid/userscripts). Wymaga iOS 15.1+.

1. Zainstaluj **Userscripts** z App Store i otwórz ją. Wskaż folder na skrypty, np. w aplikacji Pliki: „Na moim iPhonie” → `Userscripts`.
2. Skopiuj plik `userscript/doomblock.user.js` do tego folderu. Możesz to zrobić przez AirDrop z Maca, iCloud Drive albo otworzyć plik w Safari i wybrać „Udostępnij → Zachowaj w Plikach”.
3. Wejdź w **Ustawienia → Aplikacje → Safari → Rozszerzenia → Userscripts** (na starszym iOS: Ustawienia → Safari → Rozszerzenia).
   Włącz rozszerzenie i daj mu dostęp do `instagram.com` i `tiktok.com`. Możesz też wybrać „Zawsze zezwalaj” na wszystkich stronach.
4. Otwórz w Safari instagram.com i tiktok.com i zaloguj się.

## Sposób 2: własne rozszerzenie Safari przez Xcode (darmowe Apple ID)

Minus tego sposobu: przy darmowym koncie podpis wygasa po **7 dniach**. Potem trzeba podłączyć telefon i zbudować apkę jeszcze raz (Cmd+R).

1. Na Macu zainstaluj Xcode z App Store. Zaloguj się w Xcode → Settings → Accounts swoim Apple ID.
2. W Terminalu wygeneruj projekt Xcode z folderu `extension`. W nowszych wersjach Xcode narzędzie nazywa się `safari-web-extension-packager`:

   ```bash
   xcrun safari-web-extension-packager --ios-only --app-name DoomBlock --bundle-identifier com.twojeimie.doomblock --swift --copy-resources doomblock/extension
   ```

   W starszych wersjach Xcode to samo robi `safari-web-extension-converter`, z tymi samymi opcjami.
   Jeśli któraś opcja nie istnieje w Twojej wersji, uruchom bez niej. `xcrun safari-web-extension-packager --help` pokazuje dostępne opcje.
3. W Xcode wybierz projekt, a potem **każdy target** (apkę i rozszerzenie).
   W zakładce *Signing & Capabilities* ustaw **Team = Twoje imię (Personal Team)** i włącz „Automatically manage signing”.
4. Podłącz iPhone'a kablem.
   Na telefonie włącz **Ustawienia → Prywatność i ochrona → Tryb dewelopera** i zrestartuj telefon.
   Wybierz iPhone'a jako cel i naciśnij **Run** (Cmd+R).
5. Na iPhonie wejdź w Ustawienia → Ogólne → VPN i urządzenia → zaufaj swojemu Apple ID.
6. Włącz rozszerzenie: Ustawienia → Aplikacje → Safari → Rozszerzenia → DoomBlock. Zezwól na instagram.com i tiktok.com.

## Krok 3 (oba sposoby): zablokuj natywne aplikacje

Bez tego kroku skrypt łatwo obejść, otwierając zwykłą aplikację.

- Najprościej: **usuń** aplikacje Instagram i TikTok. Konto zostaje.
- Albo **Ustawienia → Czas przed ekranem → Limity aplikacji** dla Instagrama i TikToka (np. 1 minuta dziennie).
  Ustaw kod Czasu przed ekranem, najlepiej taki, którego nie pamiętasz, np. niech wpisze go ktoś inny.
- Dodaj skróty instagram.com i tiktok.com na ekran początkowy: Safari → Udostępnij → „Do ekranu początkowego”.
  **Wyłącz przełącznik „Otwórz jako aplikacja webowa” („Open as Web App”, iOS 26).**
  Wtedy ikona otwiera stronę w zwykłym Safari, gdzie działa rozszerzenie.
  Jeśli przełącznik zostanie włączony, strona otworzy się jako osobna aplikacja webowa, a rozszerzenia Safari najpewniej tam nie działają. Blokada nie zadziała.
  Sprawdź po dodaniu: ikona powinna otwierać kartę Safari z paskiem adresu.

## Aktualizacja i testy (dla programisty)

- Kod jest w jednym miejscu: `extension/content.js`. Userscript generuje `./build-userscript.sh`.
- Testy (Playwright, na podstawionych stronach): `node test/run.js`.
- Instagram i TikTok zmieniają czasem swoje strony.
  Blokada oparta na adresach URL (przekierowanie i ekran blokady) powinna być odporna na zmiany wyglądu, ale chowanie przycisków (selektory CSS) może wymagać poprawek.
