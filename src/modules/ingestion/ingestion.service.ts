import { prisma } from '../../config/prisma.js';

export class IngestionService {
  /**
   * Fetches and stores mock external data for a given city.
   * Simulates weather API and news feed ingestion.
   */
  public async fetchExternalData(city: string): Promise<void> {
    try {
      console.log(`[INGESTION] Fetching external data for ${city}...`);

      // 1. Mock Weather Data
      const precipitationMm = Math.random() * 200;
      const temperatureCelsius = 15 + Math.random() * 35;
      const aqiLevel = Math.floor(Math.random() * 500);
      const windGustKmh = Math.random() * 80;
      
      // 30% chance of extreme threshold
      const isExtremeThreshold = Math.random() < 0.3;

      const weatherMetric = await prisma.weatherMetric.create({
        data: {
          city,
          recordedAt: new Date(),
          precipitationMm: precipitationMm as any,
          temperatureCelsius: temperatureCelsius as any,
          aqiLevel,
          windGustKmh: windGustKmh as any,
          isExtremeThreshold,
        },
      });

      console.log(
        `[INGESTION] Weather recorded: Precipitation=${precipitationMm.toFixed(2)}mm, AQI=${aqiLevel}, Extreme=${isExtremeThreshold}`
      );

      // 2. Mock News Data - 50% chance of news article
      if (Math.random() < 0.5) {
        const mockSource = ['Reuters', 'BBC', 'NDTV', 'The Hindu'][Math.floor(Math.random() * 4)] || 'Reuters';
        const newsArticle = await prisma.newsArticle.create({
          data: {
            city: city,
            title: this.generateMockTitle(city),
            summary: this.generateMockSummary(),
            source: mockSource,
            url: `https://news.example.com/${Date.now()}`,
            publishedAt: new Date(),
            fetchedAt: new Date(),
          },
        });

        // Create News Signal - 60% chance of strong match
        const isStrongMatch = Math.random() < 0.6;
        const keywords = ['disruption', 'flood', 'strike', 'weather', 'alert', 'warning'];
        const matchedKeywords = keywords.slice(0, Math.floor(Math.random() * 4) + 1);

        await prisma.newsSignal.create({
          data: {
            articleId: newsArticle.id,
            city,
            isStrongMatch,
            matchedKeywords,
            createdAt: new Date(),
          },
        });

        console.log(
          `[INGESTION] News Signal created: StrongMatch=${isStrongMatch}, Keywords=${matchedKeywords.join(', ')}`
        );
      }

      console.log(`[INGESTION] External data ingestion completed for ${city}`);
    } catch (error) {
      console.error(`[INGESTION ERROR] Failed to ingest data for ${city}:`, error);
      throw error;
    }
  }

  private generateMockTitle(city: string): string {
    const titles: string[] = [
      `Heavy weather alert issued for ${city}`,
      `${city} braces for disruption`,
      `Supply chain disrupted in ${city}`,
      `${city} faces transportation challenges`,
      `Weather warning for ${city} region`,
    ];
    return titles[Math.floor(Math.random() * titles.length)]!;
  }

  private generateMockSummary(): string {
    const summaries: string[] = [
      'Emergency services on high alert as conditions worsen.',
      'Regular commute severely affected. Authorities have issued warnings.',
      'Multiple delivery services reporting delays due to weather.',
      'Civic authorities declare alert status for the region.',
      'Platform activity shows significant decline due to external factors.',
    ];
    return summaries[Math.floor(Math.random() * summaries.length)]!;
  }
}
