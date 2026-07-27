import os
from google import genai

# Initialize the client (Make sure your .env is loaded before this runs in production)
gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY")) if os.getenv("GEMINI_API_KEY") else None

def generate_campaign_image_prompt(campaign_type, target_audience):
    """
    Generates high-converting marketing materials with strict identity retention.
    """
    # AI-কে দেওয়া কড়া নির্দেশিকা যাতে আপনার ব্র্যান্ডিং এবং ফেস একদম হুবহু থাকে
    system_instruction = """
    Create a highly professional, cinematic gym marketing image prompt for the campaign.
    
    CRITICAL ENGINE DIRECTIVE: 
    Enable strict facial consistency mode. Prioritize the facial features from the provided reference image (founder_coach.png) for all subsequent generations. Maintain the subject's identity accurately while only adapting the pose, lighting, and background. Do not alter the core facial structure.
    
    Style: Premium dark theme, gold accents (Bhajrang Fitness SRB Enterprise vibe).
    """
    
    base_prompt = f"{system_instruction}\n\nCampaign Type: {campaign_type}\nTarget Audience: {target_audience}\nOutput: Detailed image generation prompt in English."
    
    return base_prompt


def generate_marketing_copy(offer_details, target_audience):
    """
    Text generation for Facebook/Instagram ads.
    Calls the Gemini Engine to write high-converting copy.
    """
    if not gemini_client:
        return "❌ Error: Gemini API key not found. Cannot generate copy."

    prompt = f"""
    Act as the elite marketing strategist for 'Bhajrang Fitness SRB'.
    Write a highly engaging, conversion-focused social media ad caption (for Facebook/Instagram).
    
    Offer Details: {offer_details}
    Target Audience: {target_audience}
    
    Rules:
    - Tone: Powerful, premium, and motivating.
    - Style: Use short, punchy sentences. Include relevant emojis (🏋️‍♂️, 💥, 🥇).
    - End with a strong Call to Action (CTA) telling them to visit the Front Desk or DM us.
    - Do not use generic hashtags; use #BhajrangFitness #SRBWarrior #FitnessMotivation.
    """

    try:
        response = gemini_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return response.text
    except Exception as e:
        return f"❌ AI Engine Error: {str(e)}"

# ==========================================
# TEST THE FUNCTIONS (Run this file directly to test)
# ==========================================
if __name__ == "__main__":
    print("--- 🎨 GENERATING IMAGE PROMPT ---")
    img_prompt = generate_campaign_image_prompt(
        campaign_type="Summer Shred Challenge 2026", 
        target_audience="Local youth looking to build muscle"
    )
    print(img_prompt)
    
    print("\n--- 📝 GENERATING AD COPY ---")
    ad_copy = generate_marketing_copy(
        offer_details="Join for 6 months at ₹7,500 and get 1 month free + a custom diet plan.",
        target_audience="College students and young professionals."
    )
    print(ad_copy)