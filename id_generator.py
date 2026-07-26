import os
from PIL import Image, ImageDraw, ImageFont
import barcode
from barcode.writer import ImageWriter

def generate_warrior_id(member_data, template_path, photo_path, output_path):
    print("⏳ ID Card Generation Started...")
    
    try:
        # ১. ব্ল্যাঙ্ক টেমপ্লেট ওপেন করা
        template = Image.open(template_path)
        draw = ImageDraw.Draw(template)
        
        # ২. মেম্বারের ছবি বসানো (পজিশন এবং সাইজ আপনার ডিজাইনের সাথে মেলাতে হবে)
        if os.path.exists(photo_path):
            photo = Image.open(photo_path)
            photo = photo.resize((240, 310)) # ছবির সাইজ (Width, Height)
            template.paste(photo, (100, 110)) # ছবি বসানোর পজিশন (X, Y)
        
        # ৩. ফন্ট সেটআপ (উইন্ডোজের ডিফল্ট Arial ফন্ট ব্যবহার করা হচ্ছে)
        # ফন্ট সাইজগুলো ডিজাইনের সাথে মানানসই করা হয়েছে
        try:
            font_bold = ImageFont.truetype("arialbd.ttf", 35) # Bold Font
            font_regular = ImageFont.truetype("arial.ttf", 30) # Regular Font
        except:
            font_bold = ImageFont.load_default()
            font_regular = ImageFont.load_default()

        # ৪. টেক্সট বসানো (X, Y কোঅর্ডিনেট) - এগুলো আপনার ডিজাইন অনুযায়ী একটু এদিক ওদিক করতে হবে
        text_color = (255, 255, 255) # সাদা রঙের লেখা
        gold_color = (255, 204, 0)   # সোনালি রঙের লেখা (যেমন ID এর জন্য)

        draw.text((600, 270), member_data['name'], font=font_bold, fill=text_color)
        draw.text((600, 320), member_data['id'], font=font_bold, fill=gold_color)
        draw.text((600, 370), member_data['package'], font=font_regular, fill=text_color)
        draw.text((600, 420), member_data['mobile'], font=font_regular, fill=text_color)
        draw.text((600, 470), member_data['join_date'], font=font_regular, fill=text_color)
        draw.text((600, 520), member_data['exp_date'], font=font_regular, fill=text_color)

        # ৫. বারকোড জেনারেট এবং বসানো (Code128 ফরমেট)
        barcode_class = barcode.get_barcode_class('code128')
        generated_barcode = barcode_class(member_data['id'], writer=ImageWriter())
        
        barcode_filename = f"temp_barcode_{member_data['id']}"
        generated_barcode.save(barcode_filename)
        
        # বারকোডটি ওপেন করে রিসাইজ করে আইডিতে পেস্ট করা
        bc_image = Image.open(f"{barcode_filename}.png")
        bc_image = bc_image.resize((280, 80)) # বারকোডের সাইজ
        template.paste(bc_image, (80, 440)) # বারকোড বসানোর পজিশন
        
        # টেম্পোরারি বারকোড ফাইলটি মুছে ফেলা
        os.remove(f"{barcode_filename}.png")

        # ৬. ফাইনাল আইডি কার্ড সেভ করা
        template.save(output_path)
        print(f"✅ Masterpiece ID Card Saved at: {output_path}")

    except Exception as e:
        print(f"❌ Error Generating ID: {e}")

# ==========================================
# 🧪 টেস্টিং সেকশন (Testing the Module)
# ==========================================
if __name__ == "__main__":
    # ডেমো মেম্বার ডেটা
    demo_member = {
        "name": "PRADIPTA BHAWAL",
        "id": "RBF07262551",
        "package": "1 YEAR PRO PLAN",
        "mobile": "+91 9876543210",
        "join_date": "16 / 07 / 2026",
        "exp_date": "16 / 07 / 2027"
    }
    
    # ফাইলের লোকেশনগুলো দিন (ধরে নিচ্ছি ছবিগুলো একই ফোল্ডারে আছে)
    # আপনার আসল ফাইলের নামগুলো এখানে দেবেন
    base_template = "ID Card.png"  
    member_photo = "member_photo.png" # মেম্বারের একটি ডেমো ছবি রাখুন 
    output_file = "Final_ID_RBF07262551.png"

    generate_warrior_id(demo_member, base_template, member_photo, output_file)