// app/api/results/by-round/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

type OneXTwo = "1" | "X" | "2";
type Choice = "TEAM1" | "DRAW" | "TEAM2";

function calcGabarito(score1: number | null, score2: number | null): OneXTwo | null {
  if (score1 === null || score2 === null) return null;
  if (score1 > score2) return "1";
  if (score1 < score2) return "2";
  return "X";
}

// regra do seu bolão 1/X/2:
// acerto = +3
// oposto (1 vs 2) = -1
// diferente sem ser oposto = 0
// palpite em empate nunca negativo (X nunca dá -1)
function calcPoints(pick: OneXTwo, gabarito: OneXTwo): number {
  if (pick === gabarito) return 3;
  // oposto só existe entre 1 e 2
  if ((pick === "1" && gabarito === "2") || (pick === "2" && gabarito === "1")) return -1;
  // todo o resto dá 0 (inclui X vs 1/2 e 1/2 vs X)
  return 0;
}

function mapChoiceToOneXTwo(choice: Choice | null): OneXTwo | null {
  if (!choice) return null;
  if (choice === "TEAM1") return "1";
  if (choice === "TEAM2") return "2";
  return "X";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roundStr = searchParams.get("round");
    const round = Number(roundStr);

    if (!roundStr || !Number.isInteger(round) || round < 1 || round > 38) {
      return NextResponse.json({ error: "round inválida (1..38)" }, { status: 400 });
    }

    // block da rodada
    const blocks = await sql`
      select id, round
      from public.blocks
      where round = ${round}
      limit 1
    `;
    const block = blocks?.[0] ?? null;

    // players (sempre)
    const playersRows = await sql`
      select id, name
      from public.players
      order by name asc
    `;
    const players = (playersRows || []).map((p: any) => ({ id: String(p.id), name: String(p.name) }));

    // se não tem bloco ainda, devolve vazio (front não quebra)
    if (!block) {
      return NextResponse.json({
        round,
        isRevealed: false,
        kickoffMin: null,
        players,
        games: [],
        grid: players.map(() => []),
        totalsRound: players.map((p) => ({ playerId: p.id, name: p.name, totalRound: 0 })),
        overall: players.map((p) => ({ playerId: p.id, name: p.name, totalOverall: 0 })),
      });
    }

    // games da rodada (ordenados)
    const gamesRows = await sql`
      select id, kickoff_at, team1, team2, score1, score2
      from public.games
      where block_id = ${block.id}
      order by kickoff_at asc, id asc
    `;

    const games = (gamesRows || []).map((g: any) => {
      const score1 = g.score1 === null || g.score1 === undefined ? null : Number(g.score1);
      const score2 = g.score2 === null || g.score2 === undefined ? null : Number(g.score2);

      return {
        id: String(g.id),
        kickoff_at: String(g.kickoff_at),
        team1: String(g.team1),
        team2: String(g.team2),
        score1,
        score2,
        gabarito: calcGabarito(score1, score2),
      };
    });

    const kickoffMin: string | null = games.length ? games[0].kickoff_at : null;
    const isRevealed = kickoffMin ? new Date() >= new Date(kickoffMin) : false;

    // ===== picks da rodada (pra montar grid) =====
    const gameIds = games.map((g) => g.id);
    let picksRound: any[] = [];

    if (gameIds.length) {
      picksRound = await sql`
        select player_id, game_id, choice
        from public.picks
        where game_id = any(${gameIds}::uuid[])
      `;
    }

    // index: pickByPlayerGame[playerId][gameId] = OneXTwo
    const pickByPlayerGame = new Map<string, Map<string, OneXTwo>>();
    for (const row of picksRound || []) {
      const playerId = String(row.player_id);
      const gameId = String(row.game_id);
      const pick = mapChoiceToOneXTwo((row.choice ?? null) as Choice | null);
      if (!pick) continue;

      if (!pickByPlayerGame.has(playerId)) pickByPlayerGame.set(playerId, new Map());
      pickByPlayerGame.get(playerId)!.set(gameId, pick);
    }

    // grid: players x games
    const grid = players.map((p) => {
      const byGame = pickByPlayerGame.get(p.id) || new Map<string, OneXTwo>();
      return games.map((g) => {
        const pick = byGame.get(g.id) ?? null;

        // pontos só existem se tiver gabarito
        if (!pick || !g.gabarito) {
          return { pick, points: null };
        }

        const points = calcPoints(pick, g.gabarito);
        return { pick, points };
      });
    });

    // totalsRound (ranking da rodada)
    const totalsRound = players
      .map((p, pi) => {
        const row = grid[pi] || [];
        const totalRound = row.reduce((acc, c) => acc + (c.points ?? 0), 0);
        return { playerId: p.id, name: p.name, totalRound };
      })
      .sort((a, b) => (b.totalRound - a.totalRound) || a.name.localeCompare(b.name, "pt-BR"));

    // ===== overall (acumulado em todos os jogos COM placar) =====
    const gamesScoredRows = await sql`
      select id, score1, score2
      from public.games
      where score1 is not null and score2 is not null
    `;

    const scoredGames = (gamesScoredRows || []).map((g: any) => ({
      id: String(g.id),
      gabarito: calcGabarito(Number(g.score1), Number(g.score2)) as OneXTwo, // aqui sempre existe
    }));

    const scoredIds = scoredGames.map((g) => g.id);
    let picksAll: any[] = [];
    if (scoredIds.length) {
      picksAll = await sql`
        select player_id, game_id, choice
        from public.picks
        where game_id = any(${scoredIds}::uuid[])
      `;
    }

    const gabaritoByGame = new Map<string, OneXTwo>();
    for (const g of scoredGames) gabaritoByGame.set(g.id, g.gabarito);

    const totalOverallByPlayer = new Map<string, number>();
    for (const p of players) totalOverallByPlayer.set(p.id, 0);

    for (const row of picksAll || []) {
      const playerId = String(row.player_id);
      const gameId = String(row.game_id);
      const pick = mapChoiceToOneXTwo((row.choice ?? null) as Choice | null);
      const gab = gabaritoByGame.get(gameId);

      if (!pick || !gab) continue;

      const pts = calcPoints(pick, gab);
      totalOverallByPlayer.set(playerId, (totalOverallByPlayer.get(playerId) ?? 0) + pts);
    }

    const overall = players
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        totalOverall: totalOverallByPlayer.get(p.id) ?? 0,
      }))
      .sort((a, b) => (b.totalOverall - a.totalOverall) || a.name.localeCompare(b.name, "pt-BR"));

    return NextResponse.json({
      round,
      isRevealed,
      kickoffMin,
      players,
      games,
      grid,
      totalsRound,
      overall,
    });
  } catch (err) {
    console.error("GET /api/results/by-round error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
