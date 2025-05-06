import { NextResponse } from 'next/server';
import { getOllamaModels } from '@/lib/ollama';

export async function GET() {
  try {
    const models = await getOllamaModels();
    return NextResponse.json({ models, installed: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ models: [], installed: false, error: error?.message || 'Failed to fetch models.' }, { status: 200 });
  }
}
