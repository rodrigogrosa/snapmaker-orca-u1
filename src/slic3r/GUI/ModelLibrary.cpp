// U1 Lab: fixed-provider requests from the trusted local home page only.
#include "WebViewDialog.hpp"
#include "GUI_App.hpp"
#include "MainFrame.hpp"
#include "Plater.hpp"
#include "Jobs/Worker.hpp"
#include <wx/timer.h>
#include "../Utils/Http.hpp"
#include "libslic3r/libslic3r.h"
#include <nlohmann/json.hpp>
#include <wx/weakref.h>
#include <wx/textdlg.h>
#include <wx/secretstore.h>
#include <boost/filesystem.hpp>
#include <fstream>
#include <set>

namespace Slic3r { namespace GUI {
using LibraryJson = nlohmann::json;
// Stable across versions, installation paths and laboratory profiles.
static const wxString library_secret_service = "com.rodrigogrosa.u1lab.thingiverse";

bool WebViewPanel::HandleLibraryMessage(const wxString& message)
{
    auto input = LibraryJson::parse(message.ToUTF8().data(), nullptr, false);
    if (!input.is_object() || !input.contains("command") || !input["command"].is_string())
        return false;
    std::string command = input["command"];
    if (command.rfind("u1_", 0) != 0)
        return false;
    const std::string home    = LOCALHOST_URL + std::to_string(wxGetApp().get_page_http_port()) + "/web/model-library/index.html";
    std::string       current = m_browser->GetCurrentURL().ToStdString();
    if (current != home && current.rfind(home + "?", 0) != 0)
        return true;
    if (!input.contains("id") || !input["id"].is_string() || input["id"].get<std::string>().size() > 80)
        return true;
    const std::string       id = input["id"];
    wxWeakRef<WebViewPanel> weak(this);
    auto                    reply = [weak, id, home](LibraryJson result) {
        result["id"] = id;
        wxGetApp().CallAfter([weak, home, result = std::move(result)] {
            if (!weak)
                return;
            const auto url = weak->m_browser->GetCurrentURL().ToStdString();
            if (url == home || url.rfind(home + "?", 0) == 0)
                weak->RunScript(wxString::FromUTF8("window.u1LibraryResponse && window.u1LibraryResponse(" + result.dump() + ");"));
        });
    };
    if (command == "u1_load_favorites" || command == "u1_save_favorites") {
        try {
            auto directory = boost::filesystem::path(data_dir()) / "model-library";
            auto path      = directory / "favorites.json";
            auto valid     = [](const LibraryJson& items) {
                if (!items.is_array() || items.size() > 1000 || items.dump().size() > 2 * 1024 * 1024)
                    return false;
                for (const auto& item : items) {
                    if (!item.is_object())
                        return false;
                    for (const auto* key : {"id", "provider", "name", "creator", "image"})
                        if (!item.contains(key) || !item[key].is_string() || item[key].get<std::string>().size() > 2048)
                            return false;
                    if (item["provider"] != "snapmaker" && item["provider"] != "thingiverse")
                        return false;
                }
                return true;
            };
            if (command == "u1_load_favorites") {
                LibraryJson items = LibraryJson::array();
                if (boost::filesystem::exists(path)) {
                    if (boost::filesystem::file_size(path) > 2 * 1024 * 1024)
                        throw std::runtime_error("size");
                    std::ifstream file(path.string());
                    file >> items;
                }
                if (!valid(items))
                    throw std::runtime_error("format");
                reply({{"ok", true}, {"data", items}});
            } else {
                auto items = input.value("items", LibraryJson::array());
                if (!valid(items))
                    throw std::runtime_error("format");
                boost::filesystem::create_directories(directory);
                auto          temporary = directory / "favorites.json.tmp";
                std::ofstream file(temporary.string(), std::ios::binary | std::ios::trunc);
                file << items.dump();
                file.close();
                if (!file)
                    throw std::runtime_error("write");
                boost::filesystem::rename(temporary, path);
                reply({{"ok", true}, {"data", true}});
            }
        } catch (...) {
            reply({{"ok", false}, {"error", "Não foi possível ler ou salvar seus favoritos. Os dados anteriores foram preservados."}});
        }
        return true;
    }
    if (command == "u1_status") {
        if (m_library_token.empty()) {
            auto          store = wxSecretStore::GetDefault();
            wxString      user;
            wxSecretValue secret;
            if (store.IsOk() && store.Load(library_secret_service, user, secret)) {
                const auto value = secret.GetAsString().ToStdString();
                if (!value.empty() && value.size() <= 512 && value.find_first_of("\r\n\t ") == std::string::npos)
                    m_library_token = value;
            }
        }
        reply({{"ok", true}, {"data", {{"thingiverse", !m_library_token.empty()}}}});
        return true;
    }
    if (command == "u1_configure_thingiverse") {
        wxPasswordEntryDialog dialog(this,
                                     wxString::FromUTF8("Cole a credencial do seu aplicativo Thingiverse. Ela será salva no cofre de "
                                                        "credenciais do sistema e preservada nas atualizações."),
                                     wxString::FromUTF8("Conectar Thingiverse"));
        if (dialog.ShowModal() == wxID_OK) {
            auto token = dialog.GetValue().ToStdString();
            if (token.empty() || token.size() > 512 || token.find_first_of("\r\n\t ") != std::string::npos) {
                reply({{"ok", false}, {"error", "Credencial inválida."}});
                return true;
            }
            auto store = wxSecretStore::GetDefault();
            if (!store.IsOk() || !store.Save(library_secret_service, "app-token", wxSecretValue(wxString::FromUTF8(token)))) {
                reply({{"ok", false},
                       {"error", "Não foi possível salvar a chave no cofre do sistema. Desbloqueie o cofre e tente novamente."}});
                return true;
            }
            m_library_token = token;
        }
        reply({{"ok", true}, {"data", {{"thingiverse", !m_library_token.empty()}}}});
        return true;
    }
    if (command == "u1_disconnect_thingiverse") {
        auto store = wxSecretStore::GetDefault();
        if (!store.IsOk() || !store.Delete(library_secret_service)) {
            reply({{"ok", false}, {"error", "Não foi possível remover a chave salva. Desbloqueie o cofre do sistema e tente novamente."}});
            return true;
        }
        m_library_token.clear();
        reply({{"ok", true}, {"data", {{"thingiverse", false}}}});
        return true;
    }
    if (command == "u1_open_downloads") {
        try {
            const auto ids = input.at("files").get<std::vector<std::string>>();
            if (ids.empty() || ids.size() > 100)
                throw std::runtime_error("files");
            std::vector<std::string> paths;
            for (const auto& id : ids) {
                const auto it = m_library_downloads.find("local:" + id);
                if (it == m_library_downloads.end() || !boost::filesystem::is_regular_file(it->second))
                    throw std::runtime_error("file");
                paths.push_back(it->second);
            }
            if (paths.size() > 1)
                for (const auto& path : paths)
                    if (boost::filesystem::path(path).extension() == ".3mf")
                        throw std::runtime_error("select");
            auto plater = wxGetApp().plater();
            if (plater->new_project(false, true) != wxID_YES) {
                reply({{"ok", false}, {"error", "Abertura cancelada. Os arquivos baixados foram mantidos."}});
                return true;
            }
            wxGetApp().mainframe->select_tab(size_t(MainFrame::tp3DEditor));
            const bool creator_project = paths.size() == 1 && boost::filesystem::path(paths.front()).extension() == ".3mf";
            const auto loaded          = plater->load_files(paths,
                                                            creator_project ? LoadStrategy::LoadModel | LoadStrategy::LoadConfig :
                                                                              LoadStrategy::LoadModel,
                                                            false);
            if (loaded.empty())
                throw std::runtime_error("open");
            const auto directory = boost::filesystem::path(data_dir()) / "model-library" / "projects";
            boost::filesystem::create_directories(directory);
            // Each import gets its own project, preserving previously edited projects.
            const auto project = directory / boost::filesystem::unique_path("thingiverse-%%%%-%%%%-%%%%.3mf");
            if (!creator_project)
                plater->arrange();
            auto timer = new wxTimer();
            timer->Bind(wxEVT_TIMER, [timer, weak, reply, project, ticks = 0](wxTimerEvent&) mutable {
                if (!weak || ++ticks > 1200) {
                    timer->Stop();
                    delete timer;
                    reply({{"ok", false}, {"error", "Organização não concluída. Os arquivos permanecem na pasta do aplicativo."}});
                    return;
                }
                auto plater = wxGetApp().plater();
                if (!plater->get_ui_job_worker().is_idle())
                    return;
                timer->Stop();
                try {
                    if (plater->export_3mf(project, SaveStrategy::Silence) != 0)
                        throw std::runtime_error("save");
                    plater->set_project_filename(wxString::FromUTF8(project.string()));
                    reply({{"ok", true}, {"data", {{"imported", true}, {"project", true}}}});
                } catch (...) {
                    reply({{"ok", false}, {"error", "As peças foram abertas, mas não foi possível salvar o projeto 3MF."}});
                }
                delete timer;
            });
            timer->Start(100);

        } catch (...) {
            reply({{"ok", false}, {"error", "Não foi possível abrir a seleção. Se houver um projeto 3MF, selecione somente ele."}});
        }
        return true;
    }
    try {
        const std::string provider = input.value("provider", "snapmaker");
        std::string       url;
        std::string       download_key;

        bool        download = false;
        std::string model_id = input.value("model_id", "");
        if (!model_id.empty() && (model_id.size() > 20 || model_id.find_first_not_of("0123456789") != std::string::npos))
            throw std::runtime_error("Identificador de modelo inválido.");
        if (provider == "snapmaker") {
            if (command == "u1_search") {
                int page = input.value("page", 1);
                if (page < 1 || page > 1000)
                    throw std::runtime_error("Página inválida.");
                url = "https://api.snapmaker.com/api/model/list?page=" + std::to_string(page) + "&pageSize=15";
            } else if (command == "u1_detail" && !model_id.empty()) {
                url = "https://api.snapmaker.com/api/model/detail/" + model_id;
            } else if (command == "u1_import" && m_library_downloads.count(model_id)) {
                url      = m_library_downloads.at(model_id);
                download = true;
            }
        } else if (provider == "thingiverse") {
            if (m_library_token.empty())
                throw std::runtime_error("Conecte seu aplicativo Thingiverse para consultar o catálogo.");
            if (command == "u1_search") {
                const auto query = input.value("query", "");
                if (query.size() > 600)
                    throw std::runtime_error("Digite uma busca de até 200 caracteres.");
                int page = input.value("page", 1);
                if (page < 1 || page > 1000)
                    throw std::runtime_error("Página inválida.");
                url = "https://api.thingiverse.com/search" + (query.empty() ? std::string() : "/" + Http::url_encode(query)) +
                      "/?type=things&page=" + std::to_string(page);
                const auto                         filters = input.value("filters", LibraryJson::object());
                static const std::set<std::string> allowed = {"per_page",        "sort",
                                                              "posted_before",   "posted_after",
                                                              "is_edu_approved", "subjects",
                                                              "grades",          "standards",
                                                              "license",         "customizable",
                                                              "show_customized", "has_makes",
                                                              "is_featured",     "is_fis_challenge_winnereatured",
                                                              "liked_by",        "made_by",
                                                              "is_derivative",   "category_id"};
                if (!filters.is_object())
                    throw std::runtime_error("Filtros inválidos.");
                for (auto it = filters.begin(); it != filters.end(); ++it) {
                    if (!allowed.count(it.key()) || !it.value().is_string() || it.value().get<std::string>().size() > 150)
                        throw std::runtime_error("Filtro não reconhecido.");
                    auto value = it.value().get<std::string>();
                    if (!value.empty())
                        url += "&" + it.key() + "=" + Http::url_encode(value);
                }
            } else if ((command == "u1_detail" || command == "u1_files") && !model_id.empty()) {
                url = "https://api.thingiverse.com/things/" + model_id + (command == "u1_files" ? "/files" : "");
            } else if (command == "u1_download_file") {
                download_key  = input.value("file", "");
                const auto it = m_library_downloads.find("remote:" + download_key);
                if (it == m_library_downloads.end())
                    throw std::runtime_error("file");
                url = it->second;

                download = true;
            }
        }
        if (url.empty())
            throw std::runtime_error("Esta integração ainda não está disponível.");
        if (m_library_request)
            m_library_request->cancel();
        auto request = Http::get(url);
        // Http inherits application-wide headers. Never forward account credentials to a catalog.
        for (const auto& header : Http::get_extra_headers())
            request.remove_header(header.first);
        request.header("Accept", download ? "application/octet-stream" : "application/json")
            .header("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.5")
            .timeout_connect(15)
            .timeout_max(download ? 120 : 30)
            .size_limit(download ? 100 * 1024 * 1024 : 5 * 1024 * 1024);
        if (provider == "thingiverse" && url.rfind("https://api.thingiverse.com/", 0) == 0)
            request.header("Authorization", "Bearer " + m_library_token);
        const std::string extension = download ? (provider == "thingiverse" ? m_library_downloads.at("ext:" + download_key) :
                                                                              boost::filesystem::path(url).extension().string()) :
                                                 "";
        request
            .on_complete([reply, weak, provider, command, model_id, download, extension, download_key](std::string body, unsigned status) {
                if (status != 200) {
                    reply({{"ok", false}, {"error", "O serviço não retornou um resultado válido."}});
                    return;
                }
                if (download) {
                    wxGetApp().CallAfter([weak, reply, model_id, provider, download_key, extension, body = std::move(body)] {
                        if (!weak)
                            return;
                        try {
                            auto directory = boost::filesystem::path(data_dir()) / "model-library";
                            boost::filesystem::create_directories(directory);
                            auto path = directory /
                                        ((provider == "thingiverse" ? "thingiverse-" + download_key : "snapmaker-" + model_id) + extension);
                            std::ofstream output(path.string(), std::ios::binary | std::ios::trunc);
                            output.write(body.data(), body.size());
                            output.close();
                            if (!output)
                                throw std::runtime_error("write");
                            if (provider == "thingiverse") {
                                weak->m_library_downloads["local:" + download_key] = path.string();
                                reply({{"ok", true}, {"data", {{"downloaded", true}}}});
                                return;
                            }
                            wxGetApp().request_open_project(path.string());
                            reply({{"ok", true}, {"data", {{"imported", true}}}});
                        } catch (...) {
                            reply({{"ok", false}, {"error", "Não foi possível salvar ou abrir o modelo."}});
                        }
                    });
                    return;
                }
                auto data = LibraryJson::parse(body, nullptr, false);
                if (data.is_discarded() || (!data.is_object() && !data.is_array())) {
                    reply({{"ok", false}, {"error", "Resposta inesperada do catálogo."}});
                    return;
                }
                if (provider == "snapmaker" && (!data.is_object() || !data.contains("code") || data["code"] != 200)) {
                    reply({{"ok", false}, {"error", "O catálogo Snapmaker não conseguiu concluir a consulta."}});
                    return;
                }
                if (provider == "thingiverse" && command == "u1_files") {
                    LibraryJson                        files = LibraryJson::array();
                    std::map<std::string, std::string> urls;
                    if (!data.is_array() || data.size() > 100) {
                        reply({{"ok", false}, {"error", "Lista de arquivos inválida ou muito extensa."}});
                        return;
                    }
                    for (const auto& file : data) {
                        if (!file.is_object() || !file.contains("id") || !file["id"].is_number_integer() || !file.contains("direct_url") ||
                            !file["direct_url"].is_string())
                            continue;
                        auto       url     = file["direct_url"].get<std::string>();
                        auto       ext     = boost::filesystem::path(file.value("name", "")).extension().string();
                        const auto api_url = "https://api.thingiverse.com/v2/files/" + std::to_string(file["id"].get<long long>()) +
                                             "/download";
                        const bool api     = url == api_url || url == api_url + "?increment_download=false";
                        if ((!api &&
                             (url.rfind("https://cdn.thingiverse.com/", 0) != 0 || url.find_first_of("?#\r\n") != std::string::npos)) ||
                            (ext != ".stl" && ext != ".3mf" && ext != ".STL"))
                            continue;
                        auto key              = model_id + "-" + std::to_string(file["id"].get<long long>());
                        urls["remote:" + key] = api ? api_url : url;
                        urls["ext:" + key]    = ext;
                        files.push_back({{"key", key}, {"name", file.value("name", "Arquivo" + ext)}, {"extension", ext}});
                    }
                    wxGetApp().CallAfter([weak, urls] {
                        if (weak)
                            for (const auto& pair : urls)
                                weak->m_library_downloads[pair.first] = pair.second;
                    });
                    reply({{"ok", true}, {"data", files}});
                    return;
                }
                if (provider == "snapmaker" && command == "u1_detail") {
                    std::string file;
                    if (data.contains("data") && data["data"].is_object() && data["data"].contains("model") &&
                        data["data"]["model"].is_string())
                        file = data["data"]["model"];
                    const auto ext           = boost::filesystem::path(file).extension().string();
                    bool       allowed       = file.rfind("https://public.resource.snapmaker.com/models/", 0) == 0 &&
                                               file.find_first_of("?#\r\n") == std::string::npos && (ext == ".3mf" || ext == ".stl");
                    data["import_available"] = allowed;
                    wxGetApp().CallAfter([weak, model_id, file, allowed] {
                        if (!weak)
                            return;
                        weak->m_library_downloads.erase(model_id);
                        if (allowed)
                            weak->m_library_downloads[model_id] = file;
                    });
                }
                reply({{"ok", true}, {"data", data}});
            })
            .on_error([reply](std::string, std::string, unsigned status) {
                std::string error = status == 401 ? "Credencial expirada ou inválida. Reconecte o Thingiverse." :
                                    status == 403 ? "O serviço bloqueou a consulta. Não foi possível acessar este catálogo." :
                                    status == 429 ? "Limite de consultas atingido. Aguarde e tente novamente." :
                                                    "Não foi possível consultar o serviço. Verifique a conexão e tente novamente.";
                reply({{"ok", false}, {"error", error}});
            });
        m_library_request = request.perform();
    } catch (const std::exception&) {
        reply({{"ok", false}, {"error", "Consulta indisponível. Verifique a conexão da plataforma e os filtros informados."}});
    }
    return true;
}
}} // namespace Slic3r::GUI
