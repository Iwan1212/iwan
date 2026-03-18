-- Seed company_context — uruchom w Supabase SQL Editor
-- Tworzy tabelę + wstawia pełną treść plików kontekstowych

CREATE TABLE IF NOT EXISTS company_context (
  id SERIAL PRIMARY KEY,
  topic TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: pozwól na odczyt przez anon key (aplikacja)
ALTER TABLE company_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON company_context FOR SELECT USING (true);

-- Dane kontekstowe

INSERT INTO company_context (topic, content) VALUES
('struktura-organizacyjna', $md$# Momentum Organizational Structure

## Founders & Leadership

### Executive Team
- **Piotr Sedzik** - CEO, Founder
- **Piotr Sobusiak** - CTO, Founder
- **Jan Kaminski** - Head of Sales, Founder

## Growth Team

- **Piotr Ratkowski** - Head of Growth
  - Growth strategy
  - Offering
  - Lead generation

- **Aleksander Cudny** - Business Analyst Lead
  - Client discovery
  - Lead processing
  - Sales operations

- **Piotr Pasierbek** - Growth Marketing Specialist
  - Outbound lead generation
  - Advertising
  - Automation

- **Kamil Maksymowicz** - B2B Marketing Specialist
  - Inbound lead generation
  - Content marketing
  - SEO

## Healthion (Open Source Team)

- **Bartosz Michalak** - Director of Engineering
  - Lead of Open Source team

- **Sebastian Kalisz** - Python Developer
  - Building OS tools

- **Filip Begiello** - Machine Learning Lead

- **Grzegorz Sztuczynski** - React Developer / Full Stack Developer

- **Kamil Piekarz** - Flutter Developer

## Leadership Team

- **Patryk Iwaszkiewicz** - Business Operations Partner
- **Renata Hara** - Head of People
- **Michał Kukuł** - Head of Delivery
- **Jagoda Nowakowska** - Head of Customer Experience
- **Kamil Żądło** - CFO$md$)
ON CONFLICT (topic) DO UPDATE SET content = EXCLUDED.content, updated_at = now();

INSERT INTO company_context (topic, content) VALUES
('strategia-2026', $md$# Momentum - Strategia 2026

## Wprowadzenie

Celem strategii Momentum na 2026 rok jest zbudowanie lidera w obszarze **Personalised Health** opartego na własnym IP, co pozwoli na zbudowanie firmy o realnej wartości **10x EBITDA**.

Nie interesuje nas dalsze skalowanie klasycznego modelu usługowego po prostu dla jego skalowania, nawet teoretycznie wyspecjalizowanego. Interesuje nas stworzenie organizacji, która:

- ma **jasno zdefiniowaną propozycję wartości i** posiada **głęboką, trudną do skopiowania ekspertyzę, dzięki swojemu IP**
- Dzięki swojemu IP pracuje dla klientów, dla których technologia i dane są kluczowe biznesowo i produktowo, co sprawia, że jesteśmy w corze tego klienta.
- dzięki temu ma realne podstawy do podnoszenia stawek i długoterminowego wiązania klientów.

Strategia 2026 nie zmienia celu wyznaczonego w 2025 roku. Zmienia **sposób dojścia do tego celu**.

---

## Punkt wyjścia – wnioski z 2025

### 1. HealthTech bez konkretu nie buduje przewagi

W 2025 roku HealthTech był dla nas słusznym kierunkiem, ale **nie generowaliśmy w nim unikalnej wartości.** W praktyce sprzedawaliśmy software development, AI, architekturę systemów itd, czyli klasyczny pakiet usług Software House'u

To pozwoliło na:

- częściowy wzrost stawek,
- wzrost udziału projektów HT,

ale **nie zmieniło naszej pozycji rynkowej w sposób fundamentalny**.

### 2. AI-Powered nie zostało zrealizowane

Wdrożenia AI w 2025 były:

- punktowe,
- niespójne,
- niemierzone.

Nie powstał system, który:

- realnie zwiększał naszą efektywność,
- znacząco obniżał koszty
- dawał Momentum przewagę nad innymi firmami.

Kierunek był słuszny, wykonanie – niewystarczające.

### 3. Open Wearables jako realny przełom

Open Wearables jest pierwszym projektem OSS, który:

- złapał obiektywną trakcję
- daje Momentum szansę na budowę pozycji eksperta w bardzo konkretnym problemie,
- pokazał, że może być źródłem ruchu, leadów i rozmów sprzedażowych.

OW pozwoliło nam też **zrozumieć bardzo głęboko problem integracji i wykorzystania danych wearables/ zdrowotnych** i będzie to fundamentem strategii 2026.

---

## Główne pytanie strategiczne na 2026

**Jak przekuć Open Source (w tym Open Wearables), który jednocześnie buduje nasze IP, ekspertyzę i przewagę technologiczną, w powtarzalne, skalowalne źródło leadów – i dzięki temu fundamentalnie zmienić pozycję Momentum na rynku?**

To pytanie jest kluczowe, ponieważ dotyczy nie tylko sprzedaży, ale:

- sposobu budowania IP,
- sposobu rozwoju kompetencji w organizacji,
- sposobu, w jaki rynek postrzega Momentum,
- typu klientów, z którymi pracujemy,
- oraz długoterminowej wartości firmy.

Momentum musi świadomie zbudować **maszynę wzrostu opartą o Open Source**, w której:

1. **Open Source generuje IP i ekspertyzę**
    Projekty OSS (z Open Wearables jako punktem wyjścia) są miejscem, w którym:
    - rozwiązujemy realne problemy technologiczne,
    - uczymy się szybciej niż rynek,
    - budujemy know-how, którego nie da się kupić ani skopiować z dnia na dzień.

2. **IP i ekspertyza są konsekwentnie rozwijane**
    Nie traktujemy OSS jako zamkniętego projektu, tylko jako:
    - stale rozwijany obszar kompetencyjny,
    - źródło nowych tematów technologicznych,
    - fundament do dalszego pogłębiania specjalizacji w danych zdrowotnych i wearables.

3. **To, co budujemy technologicznie, zamieniamy w maszynę growthową**
    Wiedza, kod, doświadczenia i wnioski:
    - są komunikowane na zewnątrz,
    - budują rozpoznawalność Momentum jako eksperta,
    - przyciągają firmy, które mają realny problem do rozwiązania.
    Dzięki temu **klienci trafiają do nas**, zamiast być aktywnie pozyskiwani klasyczną sprzedażą.

4. **Budujemy największe community wokół wearables i danych zdrowotnych**
    Celem Momentum na 2026 rok jest stworzenie:
    - największego i najbardziej rozpoznawalnego community OSS w obszarze wearables, a docelowo szerzej – danych zdrowotnych.
    - Community: wzmacnia nasze IP, przyspiesza naukę, zwiększa zasięg, i naturalnie generuje leady.

---

## Filar 1: HealthTech z jasno zdefiniowaną propozycją wartości w Personalized Health

Momentum jest firmą wyspecjalizowaną w obszarze HealthTechu z szczególnym uwzględnienem Personalized Health. Naszą propozycją wartości jest **rozwiązywanie problemów związanych z danymi zdrowotnymi** w produktach cyfrowych.

### Zakres ekspertyzy:

Momentum specjalizuje się w:

- integracji danych z wearables (Apple Health, Garmin, Oura, Whoop itd.),
- integracji z systemami EHR, LIMS i innymi systemami ochrony zdrowia, w tym normalizacji i łączeniu danych z wielu źródeł,
- projektowaniu architektury systemów opartych na danych zdrowotnych,
- przygotowywaniu fundamentów pod analitykę i wykorzystanie AI.

**Co to zmienia biznesowo?**

- jesteśmy angażowani **wcześnie**, na poziomie architektury i decyzji produktowych,
- projekty mają większą złożoność i wyższą wartość,
- relacje z klientami są dłuższe i trudniejsze do zerwania,
- mamy realne argumenty do podnoszenia stawek.

---

## Filar 2: Open Source jako główne źródło wartości i leadów

Open source jest **narzędziem**, które zmienia sposób, w jaki klienci nas znajdują, klienci nas postrzegają i klienci z nami rozmawiają.

Open Wearables i kolejne projekty OSS:

- pokazują naszą ekspertyzę w praktyce, nie w slajdach,
- budują zaufanie jeszcze przed pierwszą rozmową sprzedażową,
- przyciągają firmy, dla których dane zdrowotne są kluczowe.

### Cele OSS na 2026:

- **1000+ gwiazdek na GitHubie**
- **200+ aktywnych osób w community**
- **≥ 5 mln PLN przychodu wygenerowanego dzięki OSS**
- OSS jako stałe, powtarzalne źródło MQL i SQL

---

## Filar 3: Poprawa efektywności i modelu działania

Będziemy pracować:

- dla bardziej dojrzałych i wymagających klientów, przy bardziej złożonych systemach,
- bliżej rdzenia produktów klientów, z wyższą odpowiedzialnością i presją na jakość.
- jednocześnie chcemy podnosić stawki i marże, więc musimy to uargumentować również na poziomie efektywności

W 2026 roku Momentum:

- świadomie szuka dźwigni, które zwiększają produktywność całej organizacji na poziomie produkcji / technologii oraz operacji
- traktuje technologię jako środek do poprawy efektywności
- nie akceptuje stagnacji w sposobie pracy

Efektywność staje się jednym z kluczowych elementów **przewagi konkurencyjnej Momentum**, na równi z ekspertyzą w HealthTech i open source.

## Zmiany organizacyjne i leadership

- Momentum przestaje być firmą, w której zarząd prowadzi organizację operacyjnie.
- Liderzy muszą brać **pełną odpowiedzialność za swoje obszary i być w stanie wprowadzać w nich jakościowe zmiany zgodnie z obraną strategią**

Konkretnie:

- liderzy odpowiadają za wyniki, nie tylko za proces,
- oczekujemy samodzielności decyzyjnej,
- oczekujemy, że to liderzy będą nieustannie najlepsi w swoich obszarach
- status quo nie jest akceptowalne.

---

## Cele finansowe 2026

- **32 mln PLN przychodu**
- **5 mln PLN EBITDA**
- Marża: 15,6%
- **≥ 40% przychodów z HealthTech**
- **średnia stawka ≥ 80 USD**
- **5 mln PLN nowego przychodu z OSS**

---

## Podsumowanie

Strategia 2026 to decyzja o wejściu Momentum na trudniejszy, ale znacznie bardziej wartościowy poziom. Cel to zbudowanie jasnej propozycji wartości, dowiezienie realnej ekspertyzę opartej na IP, przekucie jej na silnik leadów oraz zwiększenie efektywność organizacji.$md$)
ON CONFLICT (topic) DO UPDATE SET content = EXCLUDED.content, updated_at = now();

INSERT INTO company_context (topic, content) VALUES
('brand-book', $md$# Momentum Brand Book

## Momentum

Momentum signifies drive to create continuous progress and accelerate change.

The name embodies energy, forward motion, and a relentless pursuit of excellence, aligning perfectly with the mission to propel health and technology solutions forward.

**Builders need Momentum.**

— Piotr Sędzik, CEO & Co-Founder

## Momentum's Mission

Make pioneering medical discoveries widely accessible by transforming them into digital products and revitalizing healthcare infrastructure through comprehensive digitalization.

## Momentum's Core Values

1. **Clarity** - Impact on real people
2. **Grit**
3. **Flair**

## Brand Strategy

The Momentum Brand Strategy is a guide to understanding the core principles behind Momentum's identity. Momentum's positioning in the HealthTech space, its human-centered approach, and its commitment to clarity and innovation.

## The Logo

Momentum's logo mark consists of three domino-like shapes, arranged to convey a sense of movement and energy — symbolizing momentum itself.

### Primary logo
This is the Momentum Logo in its primary version — the cornerstone of Momentum's visual identity.

### Co-branding
In co-branding, both logos should be the same height, with a space between them equal to the width of Momentum's logo mark.

## Typography

### Reckless Neue
Momentum's primary serif typeface. Used for the logotype and headings. Only **Reckless Neue Regular** is used.

### Matter
Most used and versatile font. Modern sans-serif (grotesque). **Matter Regular** and **Matter Medium** are used.

### Pairing
- Reckless Neue (serif) — display and key statements
- Matter (sans-serif) — headings and body text

### Display Sizes (Reckless Neue Regular):
- XX-Large: 88px / line-height 102 / letter-spacing -1%
- X-Large: 64px / line-height 76 / letter-spacing -1%
- Large: 48px / line-height 56 / letter-spacing -1%
- Medium: 40px / line-height 48 / letter-spacing -1%
- Small: 32px / line-height 40 / letter-spacing -1%

### Heading Sizes (Matter Medium):
- X-Large: 48px / line-height 56 / letter-spacing -1%
- Large: 40px / line-height 48 / letter-spacing -1%
- Medium: 32px / line-height 40 / letter-spacing -1%
- Small: 24px / line-height 32 / letter-spacing -1%
- X-Small: 16px / line-height 24 / letter-spacing 0%
- XX-Small: 14px / line-height 20 / letter-spacing 0%

### Paragraph Sizes (Matter Regular/Medium):
- Large: 24px / line-height 32
- Medium: 16px / line-height 24
- Small: 14px / line-height 20
- X-Small: 12px / line-height 16

## Color Palette

### Base Brand Colors:
- **Green [Base]**: #AFF476 (RGB: 175, 244, 118)
- **Sand [Base]**: #AEA38F (RGB: 174, 163, 143)
- **Beige [Base]**: #E6D8CB (RGB: 230, 216, 203)
- **Blue [Base]**: #4864FE (RGB: 72, 100, 254)
- **Olive [Base]**: #94A685 (RGB: 148, 166, 133)

### Green Tints:
- Lighter: #F0FDE8, Light: #CDF8B0, Base: #AFF476, Dark: #75A34F, Darker: #374D25

### Blue Tints:
- Lighter: #E5E8F8, Light: #BBC4F6, Base: #4864FE, Dark: #233BC0, Darker: #0F2077

### Olive Tints:
- Lighter: #EBEEE9, Light: #BFC8B7, Base: #94A685, Dark: #636F59, Darker: #464E3F

### Beige Tints:
- Lighter: #FAF7F4, Light: #F4EEE9, Base: #E6D8CB, Dark: #BCB0A6, Darker: #6C6660

### Sand Tints:
- Lighter: #EFEEEB, Light: #CDC7BC, Base: #AEA38F, Dark: #746D5F, Darker: #524D43

### Neutral Palette:
- 0: #FFFFFF, 100: #EAEBEE, 200: #D2D6DC, 300: #B8BEC8, 400: #99A2B1
- 500: #8792A5, 600: #6E7787, 700: #5A616E, 800: #40454E, 900: #2B2E34

### Color Usage:
- Green: CTA buttons, high-visibility elements. Lighter tints for backgrounds.
- Blue: Healthcare-centered tone. Base/dark for small elements (icons, charts). Darkest for backgrounds.
- Olive: Secondary, calmer alternative to green. Dark tints for tech/dev content.
- Beige: Neutral backgrounds, large text sections, presentations.
- Sand: Secondary neutral, contrast in copy-heavy sections.
- Neutral 900: Default font color. Neutral 100: Default background.

### Text on Colors:
- Light backgrounds (Lighter/Light/Base of most colors): Use dark fonts
- Dark backgrounds (Dark/Darker tints, Blue Base+): Use white fonts

### Gradients:
- Use light/lighter tints of different base colors or same color family
- Avoid mixing base/darker tints from different colors

### Black & White:
- True black (#000000): Use sparingly, prefer Neutral 900. OK for maximum-impact font.
- True white (#FFFFFF): Good for text on dark backgrounds and small featured sections. Avoid for large backgrounds.

## Imagery

### Photos — Best traits:
- Tech or AI related
- Strong colors or abstract, organic patterns
- Cutting-edge medical equipment
- Medical professionals
- Clearly distinctive detail related to the topic

### Icons: Use sparingly. Available in Momentum Design System in Figma.
### Charts: Monochromatic palette preferred. Large numbers in Reckless Neue.
### Domino shapes: Logo mark elements can be used as design elements in backgrounds.

## Presentation Guidelines:
1. Use proper brand elements
2. Keep it simple — avoid overcrowding
3. Subtle logo use — no need on every slide
4. Consistent alignment
5. Test for accessibility$md$)
ON CONFLICT (topic) DO UPDATE SET content = EXCLUDED.content, updated_at = now();

INSERT INTO company_context (topic, content) VALUES
('testimoniale', $md$# Momentum Client Testimonials

## Healthcare / HealthTech

### Wynter Johnson, President & Co-Founder, Caily
> "Momentum feels like our external tech co-founder."
> "Momentum were the only company understanding our vision, and knew how to deliver it."
> "We think they are great developers and we learned a lot from them."
> "What I value most about our partnership with Momentum is their willingness to challenge our assumptions when necessary. They don't just build what we ask for; they help us build what our caregivers actually need, bringing their healthcare expertise to every conversation."

### McKenna McCormick, Vice President & Co-Founder, Caily
> "The way Momentum presented their proposal was incredibly clear and comprehensive. I could walk into a meeting with our investors, show them the detailed breakdown of resources, timelines, and deliverables, and feel confident that we were making the right decision for Caily's development."

### Siddharth Agrawal, CEO, LabPlus
> "Momentum turned our complex vision into a seamless reality, making healthcare more accessible and secure for our users."
> "The team's design work aligns with our vision. The app looks and functions exactly how we want it to, and we're really happy with that."

### Don Parisi, Founder, Bennabis Health
> "Momentum brought clarity to a complex transition. Their systematic approach to scaling our platform gave us confidence at every stage."
> "Momentum's workshops were a game-changer for us. Their team took the time to deeply understand our mission and challenges, asking the right questions and aligning their solutions with our vision."

### Tomasz Smal, Senior Digital Marketing Specialist, Egis Polska
> "Their approach transformed a potentially complicated process into an intuitive user experience, which is a testament to their skill and innovation."

### Lukasz Knap, CEO, InnGen S.A.
> "What I liked the most about working with Momentum is that they are passionate about their work and devote to it 100%."
> "The team was extremely engaged in the project; they advised on many aspects and acted as Product Owners."

### Pawel Sieczkiewicz, CEO, Telemedi
> "They are transparent in the process and true experts in healthcare technology."
> "I found it impressive how many experts were on the team; their technical knowledge and experience were amazing."

### Luigi Guadagno, Founder, Luce Labs
> "The Momentum team's expertise in healthcare development is impressive and immediately apparent."

### Derek Schneider, CTO, GiftHealth
> "Their healthcare experience and technical knowledge gave us confidence from day one."

### Greg Palmer, CTO, Maxima
> "Having Momentum gives us the ability to move so much faster than we could without them."

### Adrian Kochsiek, CEO, ONVY HealthTech
> "The depth of healthcare-specific knowledge in this masterclass is impressive. Momentum has created practical guidance that actually works in regulated healthcare environments."

### Emergency Department Lead (anonymous)
> "We didn't just get new tools; we got new reflexes. This changed how we think about emergency care."

## FinTech

### Szymon Drozdzewicz, Product Owner, Smartney Grupa Oney S.A.
> "Momentum didn't just transform our technology; they transformed how we think about financial services. They showed us how digital lending can be both profitable and humane."

## EdTech / Academic

### William Cope, Professor / Director, University of Illinois / Common Ground Research Networks
> "I just spent time going back and forth, creating posts, flagging content, engaging across our communities. And I have to say: what a remarkable system. It's intuitive, responsive, and built with real scholarly interaction in mind. There's nothing else like it."

### Phillip Kalantzis Cope, PhD, CEO, Common Ground Research Networks
> "The expertise Momentum brings to healthcare technology implementation shines through every module."

## Sport / Entertainment

### Matt Robinson, CTO, Fair Play Sports Media
> "Working with Momentum to develop our OC+ product has been a pivotal step in our expansion strategy. Their commitment to quality, speed, and responsible innovation has set our flagship product up for success."
> "Momentum's methodical approach to stabilizing our Oddschecker UK app transformed the user experience."

### Michelle Palmer, Operations Director, The Coaching Manual
> "We are working with Momentum for over six months now and so far they showed us that they can be a trusted technological partner."

### Terry Barton, CEO, The Coaching Manual
> "We have incorporated the developer into our team much like we would if we hired someone directly."

### Jagdeep Chandi, Technology & Strategy Director, Nextgen Sports Ltd.
> "They want our digital product to succeed. They are very attentive to my needs, and they proposed several enhancements which were really valuable."

## General / Other Industries

### Joanna Filipek, CEO, IYOGA LLC
> "Our general feeling is that we wouldn't have been able to launch the apps as fast by working with someone else."

### Grzegorz Adamczyk, CTO, Eko-logis
> "The team was engaged and attentive to our needs, I felt like they really cared about my business and the product."

## Internal

### Jakub Mitka, Product Designer, Momentum
> "People, atmosphere and work culture are one thing, but I really enjoy the projects I get to be part of."$md$)
ON CONFLICT (topic) DO UPDATE SET content = EXCLUDED.content, updated_at = now();
