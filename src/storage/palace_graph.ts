import { VectorStorage } from './vector';

export interface GraphNode {
  wings: string[];
  halls: string[];
  count: number;
  dates: string[];
}

export interface GraphEdge {
  room: string;
  wing_a: string;
  wing_b: string;
  hall: string;
  count: number;
}

export async function buildGraph(storage: VectorStorage): Promise<{ nodes: Record<string, GraphNode>, edges: GraphEdge[] }> {
  // Wait for db init and table checks
  await storage.init();
  if (!(await storage.hasTable())) {
    return { nodes: {}, edges: [] };
  }

  // Get metadata (wing, room, hall, date) from LanceDB
  const rows = await storage.getAllMetadata(['wing', 'room', 'hall', 'date']);
  
  const roomData: Record<string, { wings: Set<string>, halls: Set<string>, count: number, dates: Set<string> }> = {};

  for (const row of rows) {
    const room = row.room as string || '';
    const wing = row.wing as string || '';
    const hall = row.hall as string || '';
    const date = row.date as string || '';

    if (room && room !== 'general' && wing) {
      if (!roomData[room]) {
        roomData[room] = { wings: new Set(), halls: new Set(), count: 0, dates: new Set() };
      }
      roomData[room].wings.add(wing);
      if (hall) roomData[room].halls.add(hall);
      if (date) roomData[room].dates.add(date);
      roomData[room].count++;
    }
  }

  const edges: GraphEdge[] = [];
  const nodes: Record<string, GraphNode> = {};

  for (const [room, data] of Object.entries(roomData)) {
    const wings = Array.from(data.wings).sort();
    const halls = Array.from(data.halls).sort();
    const dates = Array.from(data.dates).sort();

    if (wings.length >= 2) {
      for (let i = 0; i < wings.length; i++) {
        for (let j = i + 1; j < wings.length; j++) {
          for (const hall of halls) {
            edges.push({
              room,
              wing_a: wings[i],
              wing_b: wings[j],
              hall,
              count: data.count
            });
          }
        }
      }
    }

    nodes[room] = {
      wings,
      halls,
      count: data.count,
      dates: dates.slice(-5)
    };
  }

  return { nodes, edges };
}

function fuzzyMatch(query: string, nodes: Record<string, any>, n: number = 5): string[] {
  const q = query.toLowerCase();
  const scored: { room: string, score: number }[] = [];
  
  for (const room of Object.keys(nodes)) {
    if (room.includes(q)) {
      scored.push({ room, score: 1.0 });
    } else {
      const words = q.split('-');
      if (words.some(w => w && room.includes(w))) {
        scored.push({ room, score: 0.5 });
      }
    }
  }
  
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n).map(s => s.room);
}

export async function traverseGraph(storage: VectorStorage, startRoom: string, maxHops: number = 2) {
  const { nodes } = await buildGraph(storage);

  if (!nodes[startRoom]) {
    return {
      error: \`Room '\${startRoom}' not found\`,
      suggestions: fuzzyMatch(startRoom, nodes)
    };
  }

  const start = nodes[startRoom];
  const visited = new Set<string>([startRoom]);
  const results = [{
    room: startRoom,
    wings: start.wings,
    halls: start.halls,
    count: start.count,
    hop: 0,
    connected_via: [] as string[]
  }];

  const frontier: { room: string, depth: number }[] = [{ room: startRoom, depth: 0 }];

  while (frontier.length > 0) {
    const { room: currentRoom, depth } = frontier.shift()!;
    if (depth >= maxHops) continue;

    const current = nodes[currentRoom] || {};
    const currentWings = new Set(current.wings || []);

    for (const [room, data] of Object.entries(nodes)) {
      if (visited.has(room)) continue;
      
      const sharedWings = Array.from(currentWings).filter(w => data.wings.includes(w));
      if (sharedWings.length > 0) {
        visited.add(room);
        results.push({
          room,
          wings: data.wings,
          halls: data.halls,
          count: data.count,
          hop: depth + 1,
          connected_via: sharedWings.sort()
        });

        if (depth + 1 < maxHops) {
          frontier.push({ room, depth: depth + 1 });
        }
      }
    }
  }

  results.sort((a, b) => {
    if (a.hop !== b.hop) return a.hop - b.hop;
    return b.count - a.count;
  });

  return results.slice(0, 50);
}

export async function findTunnels(storage: VectorStorage, wingA?: string, wingB?: string) {
  const { nodes } = await buildGraph(storage);
  const tunnels = [];

  for (const [room, data] of Object.entries(nodes)) {
    const wings = data.wings;
    if (wings.length < 2) continue;

    if (wingA && !wings.includes(wingA)) continue;
    if (wingB && !wings.includes(wingB)) continue;

    tunnels.push({
      room,
      wings,
      halls: data.halls,
      count: data.count,
      recent: data.dates.length > 0 ? data.dates[data.dates.length - 1] : ''
    });
  }

  tunnels.sort((a, b) => b.count - a.count);
  return tunnels.slice(0, 50);
}

export async function graphStats(storage: VectorStorage) {
  const { nodes, edges } = await buildGraph(storage);

  let tunnelRooms = 0;
  const wingCounts: Record<string, number> = {};

  for (const data of Object.values(nodes)) {
    if (data.wings.length >= 2) tunnelRooms++;
    for (const w of data.wings) {
      wingCounts[w] = (wingCounts[w] || 0) + 1;
    }
  }

  const roomsPerWing = Object.entries(wingCounts)
    .sort((a, b) => b[1] - a[1])
    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {} as Record<string, number>);

  const topTunnels = Object.entries(nodes)
    .filter(([_, d]) => d.wings.length >= 2)
    .sort((a, b) => b[1].wings.length - a[1].wings.length)
    .slice(0, 10)
    .map(([r, d]) => ({ room: r, wings: d.wings, count: d.count }));

  return {
    total_rooms: Object.keys(nodes).length,
    tunnel_rooms: tunnelRooms,
    total_edges: edges.length,
    rooms_per_wing: roomsPerWing,
    top_tunnels: topTunnels
  };
}
