
import { GoogleGenAI } from "@google/genai";
import { Product, Transaction } from "../types";

export class AIService {
  // Fix: Removed stateful initialization in constructor to follow guidelines of creating instance before call
  // and removed unnecessary API key validation logic as availability is assumed.

  async getBusinessInsights(products: Product[], transactions: Transaction[]) {
    const summary = {
      totalProducts: products.length,
      lowStock: products.filter(p => p.stock <= p.minStock).length,
      totalSales: transactions.reduce((acc, t) => acc + t.total, 0),
      topProducts: products.slice(0, 5).map(p => p.name)
    };

    try {
      // Fix: Create new GoogleGenAI instance right before making an API call
      // Always use process.env.API_KEY directly in a named parameter.
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Berikan analisis bisnis singkat dalam Bahasa Indonesia untuk toko minimarket dengan data berikut: ${JSON.stringify(summary)}. Berikan 3 poin strategi yang sangat konkret.`,
      });
      // Fix: Access response text property directly (not as a method).
      return response.text || "AI tidak memberikan respon.";
    } catch (error: any) {
      console.warn("AI Service error:", error.message);
      return "Layanan AI tidak dapat diakses saat ini.";
    }
  }
}

export default new AIService();
