import RequestManager from "./requestManager";

export interface VerificationResult {
  should_stop: boolean;
  stop_reason: string;
  user_intent: string;
}

export class Verifier {
  private apiUrl: string;
  private model: string;
  private userIntent: string = "";

  constructor(apiUrl: string, model: string) {
    this.apiUrl = apiUrl;
    this.model = model;
  }

  /**
   * Reset verifier for new user message
   */
  reset() {
    this.userIntent = "";
  }

  /**
   * Verify if conversation should stop based on user's initial intent
   */
  async verify(
    initialUserMessage: string,
    currentBlock: string,
    latestMessage: string,
    latestSpeaker: string
  ): Promise<VerificationResult> {
    const prompt = `다음은 유저의 최초 발화와 현재까지의 대화 상황입니다.

최초 유저 발화:
${initialUserMessage}

현재까지의 대화 요약:
${currentBlock || "(없음)"}

최근 메시지:
${latestSpeaker}: ${latestMessage}

다음 작업을 수행해주세요:
1. 최초 유저 발화의 목적(의도)을 파악 ${this.userIntent ? `(기존: ${this.userIntent})` : ''}
2. 현재 대화가 유저의 목적을 충분히 만족시켰는지 판단
3. 또는 대화가 유저의 목적에 대해 더 이상 진전이 없는지 판단

대화를 종료해야 하는 경우:
- 유저의 질문에 충분한 답변이 제공됨
- 유저가 요청한 정보/추천/의견이 제공됨
- 대화가 반복되거나 새로운 인사이트 없이 순환됨
- 주제가 완전히 벗어남

대화를 계속해야 하는 경우:
- 유저의 질문에 아직 답변이 부족함
- 토론이 활발하게 진행 중이며 새로운 아이디어가 나오고 있음
- 유저의 목적 달성을 위해 더 논의가 필요함

JSON 형태로만 응답해주세요:
{
  "user_intent": "유저의 발화 목적 (간단명료하게)",
  "should_stop": true,
  "stop_reason": "대화 종료 사유 설명"
}

should_stop이 false인 경우 stop_reason은 빈 문자열로 설정하세요.`;

    try {
      console.log(`\n[Verifier] Checking if conversation should stop...`);

      const requestManager = RequestManager.getInstance();
      const response = await requestManager.request(
        this.apiUrl,
        this.model,
        [{ role: "user", content: prompt }],
        400,
        0.3
      );

      // Parse JSON response
      let jsonStr = response.trim();
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      } else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/```\s*/g, "");
      }

      const parsed = JSON.parse(jsonStr);

      // Update user intent if this is the first time or if it changed
      if (parsed.user_intent && !this.userIntent) {
        this.userIntent = parsed.user_intent;
        console.log(`[Verifier] User intent identified: ${this.userIntent}`);
      }

      const result: VerificationResult = {
        should_stop: parsed.should_stop === true,
        stop_reason: parsed.stop_reason || "",
        user_intent: this.userIntent
      };

      if (result.should_stop) {
        console.log(`[Verifier] STOP recommended: ${result.stop_reason}`);
      } else {
        console.log(`[Verifier] Continue conversation`);
      }

      return result;
    } catch (error) {
      console.error("Error in verification:", error);
      // On error, don't stop the conversation
      return {
        should_stop: false,
        stop_reason: "",
        user_intent: this.userIntent
      };
    }
  }
}
