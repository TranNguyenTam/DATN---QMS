using System;
using System.Text;

namespace Qms.Infrastructure.Utils;

public class CryptUtil
{
    public string EncryptPassword(string passwordData)
    {
        if (string.IsNullOrEmpty(passwordData)) return passwordData;

        int num = 0;
        foreach (char c in passwordData)
        {
            num += c;
        }

        int num6 = num % 128;
        int num7 = Convert.ToInt32((double)num / 128.0); // C# Banker's Rounding exactly as described

        if (num6 == 0) num6++;
        if (num6 == '\'') num6++;

        if (num7 == 0) num7++;
        if (num7 == '\'') num7++;

        int num8 = num6 + num7;
        StringBuilder text = new StringBuilder();

        for (int i = 0; i < passwordData.Length; i++)
        {
            char originalChar = passwordData[i];
            int charValue = (originalChar ^ num8) + i;
            string text2 = ((char)charValue).ToString();

            if (text2[0] != '\0')
            {
                if (text2 != "'")
                {
                    text.Append(text2);
                }
                else
                {
                    text.Append("''"); // Escape nháy đơn
                }
            }
            else
            {
                text.Append(originalChar);
            }
        }

        return ((char)num6).ToString() + ((char)num7).ToString() + text.ToString();
    }

    public string DecryptPassword(string passwordData)
    {
        if (string.IsNullOrEmpty(passwordData)) return passwordData;

        int num = passwordData[0];
        int num2 = passwordData[1];
        int num3 = num + num2;

        string remainingData = passwordData.Substring(2).Replace("''", "'");
        StringBuilder text = new StringBuilder();

        for (int i = 0; i < remainingData.Length; i++)
        {
            char c = remainingData[i];
            int valStep1 = (c ^ num3) + i;
            
            if ((char)valStep1 == '\0')
            {
                text.Append(c);
            }
            else
            {
                int valFinal = (c - i) ^ num3;
                text.Append((char)valFinal);
            }
        }

        return text.ToString();
    }

    // ─── Bcrypt (chuẩn mới) + tương thích ngược với mật khẩu XOR cũ ───
    // Mật khẩu cũ trong DB lưu dạng XOR (DecryptPassword đọc được); mật khẩu mới
    // lưu dạng bcrypt ("$2..."). VerifyPassword tự nhận dạng để kiểm cho cả hai.

    public bool IsBcryptHash(string? stored)
        => !string.IsNullOrEmpty(stored) && stored.StartsWith("$2");

    public bool NeedsRehash(string? stored) => !IsBcryptHash(stored);

    public string HashPassword(string plain)
        => global::BCrypt.Net.BCrypt.HashPassword(plain);

    public bool VerifyPassword(string plain, string? stored)
    {
        if (string.IsNullOrEmpty(stored)) return false;
        if (IsBcryptHash(stored))
        {
            try { return global::BCrypt.Net.BCrypt.Verify(plain, stored); }
            catch { return false; }
        }
        // Mật khẩu cũ: so khớp qua giải mã XOR.
        return DecryptPassword(stored) == plain;
    }
}
