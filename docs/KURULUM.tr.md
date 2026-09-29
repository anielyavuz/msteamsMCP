# msteams-mcp — adım adım kurulum (Türkçe)

Amaç: Teams sohbet mesajlarını **yalnızca oturum açan kişi adına, yalnızca okuma** yetkisiyle bir AI
asistanına (ör. VS Code Copilot Chat) açmak. Portal menü adları İngilizce arayüze göredir.

> **Önemli (güvenlik değerlendirmesi):** Araçların döndürdüğü veriler — Teams **mesaj metinleri**, kişi adları,
> sohbet başlıkları — MCP istemcisinin kullandığı **AI modeline gönderilir**. Model bulutta çalışıyorsa
> (Copilot, Claude, ChatGPT…) bu veriler bilgisayardan çıkar ve sağlayıcının, sizin planınızdaki koşullarına
> göre işlenir. Ayrıntı: [DATA-FLOW.md](DATA-FLOW.md). Kurumsal kullanımdan önce bu belgeyle IT/güvenlik
> onayı alın.

## 1. Gerekenler
- Node.js 20+ (`node -v`), git, openssl
- Entra'da uygulama kaydı oluşturma yetkisi
- VS Code 1.100+ (Code → About). MCP menüsü yoksa sürüm eskidir; güncelleyin.

## 2. Entra uygulama kaydı
1. **App registrations → + New registration** → Name: `msteams-mcp` → **Single tenant** → Redirect URI boş → **Register**.
2. **Overview**'dan **Application (client) ID** ve **Directory (tenant) ID**'yi not alın (sır değildir).
3. **Authentication** (yeni arayüzde **Settings** sekmesi) → **Allow public client flows = Yes** → Save.
   Secret ya da sertifika **oluşturmayın**.
4. **API permissions → + Add a permission → Microsoft Graph → Delegated** → `Chat.Read` ekleyin
   (`User.Read` zaten var). **Application permissions eklemeyin**, **Grant admin consent'e basmayın**.
5. **Enterprise applications → (uygulama) → Properties → Assignment required? = Yes** → Save →
   **Users and groups → + Add user/group** → yalnızca kullanacak kişi(ler).

## 3. Kodu indir ve kur
```bash
git clone https://github.com/anielyavuz/msteamsMCP.git
cd msteamsMCP
npm ci --ignore-scripts      # kilit dosyasındaki sürümler; kurulum betikleri çalışmaz
npm test                     # çevrimdışı birim testleri: hepsi "pass" olmalı
```

## 4. Ayar dosyası
```bash
cp .env.example .env
chmod 600 .env
openssl rand -hex 24         # çıkan değeri MCP_ACCESS_TOKEN olarak yazın
```
`.env` içinde doldurun: `TENANT_ID`, `CLIENT_ID`, `MCP_ACCESS_TOKEN`. Kontrol: `npm run tools`.

## 5. Microsoft girişi
```bash
npm run login
```
Çıkan adresi açın, kodu girin, atanmış hesapla giriş yapın. Onay ekranında uygulama adınızı ve yalnızca
profil + sohbet okuma iznini görmelisiniz. **"Kuruluşunuz adına onaylayın" kutusunu İŞARETLEMEYİN.**
Kontrol: `npm run status` → `"signedIn": true`.

Nasıl çalışır: kod Microsoft'tan bir cihaz kodu ister; siz tarayıcıda giriş yapınca Microsoft token'ı yalnız
bekleyen terminal işlemine verir. Parola/MFA yalnız Microsoft sayfasına girilir. Token dosyası:
`~/.msteams-mcp/token-cache.json` (izin 600) — parola gibi koruyun. **Kendi başlatmadığınız bir kodu asla girmeyin.**

## 6. Sunucuyu başlat
```bash
npm start
```
Beklenen: hesap, uygulama kimliği, izinler, açık araçlar ve `ready: http://127.0.0.1:3978/mcp`.
Terminal açık kaldıkça çalışır (Ctrl+C durdurur). Her istek bir satır log: hangi hesap, hangi istemci/sürüm,
hangi araç, sonuç, süre. Mesaj içeriği yazılmaz. Dosyaya da yazmak için `.env`'e `LOG_FILE=./msteams-mcp.log.jsonl`.

## 7. Test (ikinci terminal)
```bash
npm run selftest -- --live
```
Hepsi `PASS` olmalı: token'sız/yanlış token 401, yabancı Host 403, yalnız izinli araçlar görünür ve hepsi
salt okunur, olmayan araç reddedilir, giriş yapılmış, profil/sohbet/mesaj okunuyor, başkasına ait sohbet
kimliği hata veriyor.

## 8. VS Code'a ekle
`Cmd+Shift+P` → **MCP: Open User Configuration** → [OPERATIONS.md](OPERATIONS.md#connect-a-client) içindeki
JSON'u yapıştırın → **Start** → şifre kutusuna `MCP_ACCESS_TOKEN` değerini girin ("Bearer" yazmadan).
Copilot Chat → **Agent** modu → "Teams sohbetlerimi listele".

## 9. Entra'da denetim
- **Enterprise applications → uygulama → Permissions**: *User consent* yalnızca sizin adınız; *Admin consent* boş.
- **Sign-in logs**: kim, ne zaman giriş yaptı.
- Kapatma: *Properties → Enabled for users to sign-in? = No*. Çıkış: `npm run logout`.

## 10. Yeni yetenek eklemek
Şu an yalnızca sohbet mesajı okuma var; kanal mesajları, arama, bahsedilmeler, toplantılar ve (ayrı güvenlik
incelemesiyle) yazma işlemleri araç olarak eklenebilir. Plan ve her adımın izni: [ROADMAP.md](ROADMAP.md);
nasıl eklenir: [ARCHITECTURE.md](ARCHITECTURE.md#adding-a-tool). Her yeni araç: Entra'ya izni ekle →
`ENABLED_TOOLS`'a ekle → `npm run login` → yeniden başlat → `npm run selftest -- --live` → DATA-FLOW.md'yi güncelle.

## Sorun giderme
Hata kodları ve çözümleri: [OPERATIONS.md](OPERATIONS.md#troubleshooting).
