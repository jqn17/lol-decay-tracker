const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// To jest ta magiczna linijka dla Twoich zdjęć:
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'decaytracker.html'));
});
app.get('/api/check', async (req, res) => {
    const { name, tag } = req.query;
    const apiKey = process.env.RIOT_API_KEY;

    try {
        const accUrl = `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?api_key=${apiKey}`;
        const accData = await (await fetch(accUrl)).json();
        
        if (!accData.puuid) return res.json({ error: "Nie znaleziono gracza" });

        const leagueUrl = `https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/${accData.puuid}?api_key=${apiKey}`;
        const leagues = await (await fetch(leagueUrl)).json();
        const solo = leagues.find(l => l.queueType === "RANKED_SOLO_5x5");

        if (!solo) return res.json({ error: "Brak rangi SoloQ" });

        const matchUrl = `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${accData.puuid}/ids?queue=420&count=1&api_key=${apiKey}`;
        const mIds = await (await fetch(matchUrl)).json();
        
        let decayMsg = "Brak gier";
        let nextGameMsg = "";
        
        if (mIds.length > 0) {
            const mData = await (await fetch(`https://europe.api.riotgames.com/lol/match/v5/matches/${mIds[0]}?api_key=${apiKey}`)).json();
            const lastGameTs = mData.info.gameEndTimestamp;
            const diffDays = Math.floor((Date.now() - lastGameTs) / 86400000);
            
            const isApex = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(solo.tier);
            const maxDays = isApex ? 14 : 28;
            const bankDays = Math.max(0, maxDays - diffDays);
            
            decayMsg = `Ostatnio: ${diffDays} d. temu | Bank: ${bankDays} d.`;
            
            // Obliczanie daty następnej gry
            const deadline = new Date(lastGameTs + (maxDays * 86400000));
            nextGameMsg = `Zagraj przed: ${deadline.toLocaleDateString('pl-PL')} o ${deadline.toLocaleTimeString('pl-PL', {hour: '2-digit', minute:'2-digit'})}`;
        }

        res.json({
            rank: `${solo.tier} ${solo.rank} (${solo.leaguePoints} LP)`,
            decay: decayMsg,
            nextGame: nextGameMsg
        });
    } catch (e) {
        res.json({ error: "Błąd serwera" });
    }
});
