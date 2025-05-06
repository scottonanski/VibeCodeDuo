import { NextResponse } from 'next/server';
import { getOllamaModels, isOllamaInstalled } from '@/lib/ollama';

export async function GET() {
  const installed = await isOllamaInstalled();
  if (!installed) {
    return NextResponse.json({ models: [], installed: false, error: 'Ollama is not installed.' }, { status: 200 });
  }
  const models = await getOllamaModels();
  return NextResponse.json({ models, installed: true }, { status: 200 });
}
