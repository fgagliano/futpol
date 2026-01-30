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

// regra 1/X/2 do seu bolão:
// acerto = +3
// oposto (1 vs 2) = -1
// diferente sem ser oposto = 0
// palpite em empate nunca negativo
function calcPoints(pick: OneXTwo, gabarito: OneXTwo): number {
  if (pick === gabarito) return 3;
  if ((pick === "1" && gabarito === "2") || (pick === "2" && gabarito === "1")) return -1;
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

    // players (sempre)
    const playersRows = await sql`
      select id, name
      from public.players
      order by name asc
    `;
    const players = (playersRows || []).map((p: any) => ({
      id: String(p.id),
      name: String(p.name),
    }));

    // block da rodada
    const blockRows = await sql`
      select id, round
      from public.blocks
      where round = ${round}
      limit 1
    `;
    const block = blockRows?.[0] ?? null;

    // se não tem bloco ainda: devolve estrutura vazia (front não quebra)
    if (!block) {
      return NextResponse.json({
        round,
        isRevealed: false,
        kickoffMin: null,
        players,
        games: [],
        grid: players.map(() => []),
        totalsRound: players.map((p: any) => ({ playerId: p.id, name: p.name, totalRound: 0 })),
        overall: players.map((p: any) => ({ playerId: p.id, name: p.name, totalOverall: 0 })),
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

    // =========================
    // PICKS DA RODADA (SEM ARRAY): JOIN picks -> games -> blocks
    // =========================
    const picksRoundRows = await sql`
      select
        p.player_id,
        p.game_id,
        p.choice,
        g.score1,
        g.score2
      from public.picks p
      join public.games g on g.id = p.game_id
      where g.block_id = ${block.id}
    `;

    // index pickByPlayerGame[playerId][gameId] = pick 1/X/2
    const pickByPlayerGame = new Map<string, Map<string, OneXTwo>>();
    for (const row of picksRoundRows || []) {
      const playerId = String((row as any).player_id);
      const gameId = String((row as any).game_id);
      const pick = mapChoiceToOneXTwo(((row as any).choice ?? null) as Choice | null);
      if (!pick) continue;

      if (!pickByPlayerGame.has(playerId)) pickByPlayerGame.set(playerId, new Map());
      pickByPlayerGame.get(playerId)!.set(gameId, pick);
    }

    // grid players x games
    const grid = players.map((pl: any) => {
      const byGame = pickByPlayerGame.get(pl.id) || new Map<string, OneXTwo>();
      return games.map((g: any) => {
        const pick = byGame.get(g.id) ?? null;
        if (!pick || !g.gabarito) return { pick, points: null };
        return { pick, points: calcPoints(pick, g.gabarito) };
      });
    });

    // totalsRound (ranking rodada)
    const totalsRound = players
      .map((p: any, pi: number) => {
        const row = grid[pi] || [];
        const totalRound = row.reduce((acc: number, c: any) => acc + (c.points ?? 0), 0);
        return { playerId: p.id, name: p.name, totalRound };
      })
      .sort((a: any, b: any) => (b.totalRound - a.totalRound) || a.name.localeCompare(b.name, "pt-BR"));

    // =========================
    // OVERALL (ACUMULADO) — SOMENTE JOGOS COM PLACAR (SEM ARRAY): JOIN picks -> games (com placar)
    // =========================
    const picksScoredRows = await sql`
      select
        p.player_id,
        p.choice,
        g.score1,
        g.score2
      from public.picks p
      join public.games g on g.id = p.game_id
      where g.score1 is not null and g.score2 is not null
    `;

    const totalOverallByPlayer = new Map<string, number>();
    for (const p of players) totalOverallByPlayer.set(p.id, 0);

    for (const row of picksScoredRows || []) {
      const playerId = String((row as any).player_id);
      const pick = mapChoiceToOneXTwo(((row as any).choice ?? null) as Choice | null);
      const s1 = (row as any).score1 === null || (row as any).score1 === undefined ? null : Number((row as any).score1);
      const s2 = (row as any).score2 === null || (row as any).score2 === undefined ? null : Number((row as any).score2);
      const gab = calcGabarito(s1, s2);

      if (!pick || !gab) continue;

      const pts = calcPoints(pick, gab);
      totalOverallByPlayer.set(playerId, (totalOverallByPlayer.get(playerId) ?? 0) + pts);
    }

    const overall = players
      .map((p: any) => ({
        playerId: p.id,
        name: p.name,
        totalOverall: totalOverallByPlayer.get(p.id) ?? 0,
      }))
      .sort((a: any, b: any) => (b.totalOverall - a.totalOverall) || a.name.localeCompare(b.name, "pt-BR"));

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
