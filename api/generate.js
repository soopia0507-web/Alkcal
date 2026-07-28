export default async function handler(req, res) {
    // Only accept POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                error: '서버 환경 변수에 GEMINI_API_KEY가 설정되어 있지 않습니다. Vercel 설정에서 환경 변수를 등록해 주세요.'
            });
        }

        const { image } = req.body;
        if (!image) {
            return res.status(400).json({ error: '분석할 이미지 데이터가 없습니다.' });
        }

        // Extract mime type and raw base64 string
        const matches = image.match(/^data:(image\/\w+);base64,(.+)$/);
        let mimeType = 'image/jpeg';
        let base64Data = image;

        if (matches && matches.length === 3) {
            mimeType = matches[1];
            base64Data = matches[2];
        }

        const promptText = `
당신은 전문 영양사이자 AI 음식 칼로리 분석 전문가입니다.
제공된 이미지(급식 식판 또는 일반 음식 사진)를 자세히 분석하고 다음 JSON 형식에 정확히 맞추어 응답하세요.

반드시 다른 설명 없이 오직 JSON 객체 형태로만 반환해야 합니다:
{
  "totalCalories": 번호(총 칼로리 숫자 kcal 단위),
  "carbs": 번호(탄수화물 그램 수 g),
  "protein": 번호(단백질 그램 수 g),
  "fat": 번호(지방 그램 수 g),
  "sodium": 번호(나트륨 밀리그램 수 mg),
  "sugar": 번호(당류 그램 수 g),
  "summary": "식단 전체 한 줄 요약 (예: 고단백 영양 균형 식단)",
  "items": [
    {
      "name": "음식/반찬 이름 (예: 현미밥, 제육볶음, 포기김치)",
      "portion": "추정 분량 (예: 1공기, 150g, 1종지)",
      "calories": 번호(칼로리 kcal)
    }
  ],
  "healthTip": "이 식단에 대한 영양학적 조언 및 가이드 (2-3문장)"
}
`;

        const payload = {
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: promptText },
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: base64Data
                            }
                        }
                    ]
                }
            ],
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

        const geminiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error('Gemini API Error:', errorText);
            return res.status(geminiResponse.status).json({
                error: `Gemini API 호출 실패: ${geminiResponse.statusText}`
            });
        }

        const result = await geminiResponse.json();
        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!responseText) {
            return res.status(500).json({ error: 'AI 응답 분석 결과를 가져올 수 없습니다.' });
        }

        const parsedJson = JSON.parse(responseText);
        return res.status(200).json(parsedJson);

    } catch (error) {
        console.error('Server Function Error:', error);
        return res.status(500).json({ error: error.message || '서버 내부 오류가 발생했습니다.' });
    }
}