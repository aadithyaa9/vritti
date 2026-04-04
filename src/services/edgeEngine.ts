import { prisma } from "../config/prisma.js";

// Simple rule-based Edge Engine (Phase 1)
export async function runEdgeEngine(city: string) {
  // 1. Get latest weather
  const weather = await prisma.weatherMetric.findFirst({
    where: { city },
    orderBy: { recordedAt: "desc" }
  });

  // 2. Get recent activity
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activity = await prisma.activityLog.aggregate({
    where: {
      city,
      date: { gte: today }
    },
    _avg: {
      ordersCompleted: true
    }
  });

  const avgOrders = activity._avg.ordersCompleted || 0;

  // 3. Simple disruption logic
  let isDisrupted = false;
  let reason = "NORMAL";

  if (weather?.precipitationMm && Number(weather.precipitationMm) > 20 && avgOrders < 5) {
    isDisrupted = true;
    reason = "HEAVY_RAIN_LOW_ACTIVITY";
  }

  // 4. Store disruption check
  const disruption = await prisma.disruptionCheck.create({
    data: {
      city,
      validNewsCount: 0,
      newsStatus: false,
      avgOrders,
      disruption: isDisrupted,
      reason
    }
  });

  // 5. If disrupted → create event + flag users
  if (isDisrupted) {
    const event = await prisma.event.create({
      data: {
        city,
        type: "WEATHER",
        status: "ACTIVE",
        triggeredBy: "EDGE_ENGINE",
        disruptionCheckId: disruption.id,
        startTime: new Date()
      }
    });

    // Flag all users in that city
    const users = await prisma.user.findMany({ where: { city } });

    for (const user of users) {
      await prisma.heartbeat.create({
        data: {
          userId: user.id,
          status: "FLAGGED"
        }
      });

      // Update their policy to FLAGGED
      await prisma.policy.updateMany({
        where: {
          userId: user.id,
          status: "active"
        },
        data: {
          status: "FLAGGED"
        }
      });
    }

    return { disrupted: true, eventId: event.id };
  }

  return { disrupted: false };
}
