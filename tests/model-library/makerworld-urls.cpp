#include "../../src/slic3r/GUI/MakerWorldUrls.hpp"
#include <cassert>
#include <iostream>
int main()
{
    using namespace Slic3r::GUI;
    assert(makerworld_model_id("https://makerworld.com/en/models/978489-name#profileId-123") == "978489");
    assert(makerworld_model_id("https://makerworld.com/models/978489") == "978489");
    for (const auto* url :
         {"https://makerworld.com.evil.test/en/models/1", "http://makerworld.com/en/models/1", "https://evil@makerworld.com/en/models/1",
          "https://makerworld.com/en/models/abc", "https://makerworld.com/en/models/1\nX"})
        assert(makerworld_model_id(url).empty());
    assert(makerworld_download_allowed("https://makerworld.bblmw.com/model/file.3mf?signature=test"));
    assert(makerworld_download_allowed("https://s3.us-west-2.amazonaws.com/bucket/file.3mf?signature=test"));
    for (const auto* url :
         {"http://makerworld.bblmw.com/file", "https://makerworld.bblmw.com.evil.test/file", "https://makerworld.bblmw.com@evil.test/file",
          "https://127.0.0.1/file", "https://evil.amazonaws.com/file", "https://makerworld.bblmw.com:443/file"})
        assert(!makerworld_download_allowed(url));
    std::cout << "PASS MakerWorld URL and download host boundaries\n";
}
