#pragma once
#include <regex>
#include <string>
namespace Slic3r { namespace GUI {
inline std::string makerworld_model_id(const std::string& url)
{
    std::smatch match;
    if (url.size() > 2048 ||
        !std::regex_match(url, match, std::regex("https://makerworld\\.com/(?:[a-zA-Z-]+/)?models/([0-9]{1,19})(?:[/?#-][^\\r\\n]*)?")))
        return {};
    return match[1].str();
}
inline bool makerworld_download_allowed(const std::string& url)
{
    std::smatch host;
    if (!std::regex_match(url, host, std::regex("https://([^/:?#@]+)(/[^\\r\\n]*)")))
        return false;
    const auto domain = host[1].str();
    return domain == "makerworld.bblmw.com" || domain == "public-cdn.bblmw.com" ||
           std::regex_match(domain, std::regex("(?:[a-z0-9-]+\\.)*s3[.-][a-z0-9.-]+\\.amazonaws\\.com"));
}
}} // namespace Slic3r::GUI
