const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const app = express();
const port = process.env.PORT || 3000;

// Blokada: max 10 sprawdzeń na 5 minut dla jednego adresu IP
const limiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10, 
    message: { error: "Zbyt dużo prób! Odpocznij chwilę." }
});

app.use('/api/', limiter);
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'decaytracker.html'));
});

app.get('/api/check', async (req, res) => {
    const { name, tag, region } = req.query;
    const apiKey = process.env.RIOT_API_KEY;

    const routingMap = {
        'euw1': 'europe',
        'eun1': 'europe',
        'na1': 'americas'
    };
    const routing = routingMap[region] || 'europe';

    try {
        // 1. Szukamy PUUID
        const accRes = await fetch(`https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?api_key=${apiKey}`);
        const accData = await accRes.json();
        
        if (!accData.puuid) return res.json({ error: "Nie znaleziono gracza" });

        // 2. Szukamy rangi
        const lRes = await fetch(`https://${region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${accData.puuid}?api_key=${apiKey}`);
        const leagues = await lRes.json();
        const solo = leagues.find(l => l.queueType === "RANKED_SOLO_5x5");

        if (!solo) return res.json({ error: "Brak rangi SoloQ" });

        // 3. Sprawdzamy mecze (tylko SoloQ - queue 420)
        const mIds = await (await fetch(`https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${accData.puuid}/ids?queue=420&count=1&api_key=${apiKey}`)).json();
        
        // --- LOGIKA DECAY ---
        const isApex = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(solo.tier);
        const isDiamond = solo.tier === "DIAMOND";
        const hasDecay = isApex || isDiamond;

        // Limity: Apex 14 dni, Diamond 28 dni
        const maxDays = isApex ? 14 : (isDiamond ? 28 : 0);
        
        let diffDays = 0;
        let bankDays = hasDecay ? 0 : "∞";
        let deadlineTs = null;

        if (hasDecay && mIds && mIds.length > 0) {
            const mData = await (await fetch(`https://${routing}.api.riotgames.com/lol/match/v5/matches/${mIds[0]}?api_key=${apiKey}`)).json();
            
            if (mData && mData.info) {
                const lastGameTs = mData.info.gameEndTimestamp;
                const now = Date.now();
                
                diffDays = Math.floor((now - lastGameTs) / 86400000);
                deadlineTs = lastGameTs + (maxDays * 86400000);
                
                const timeLeftMs = deadlineTs - now;
                bankDays = Math.max(0, Math.floor(timeLeftMs / 86400000));
            }
        }

        res.json({
            rank: `${solo.tier} ${solo.rank} (${solo.leaguePoints} LP)`,
            diffDays: diffDays,
            bankDays: bankDays,
            deadline: deadlineTs
        });

    } catch (e) {
        res.json({ error: "Błąd serwera: " + e.message });
    }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
