// Regression test linked against the same libslic3r as the native application.
#include "libslic3r/PrintConfig.hpp"
#include <iostream>
#include <stdexcept>
using namespace Slic3r;
static void check(bool value, const char* message)
{
    if (!value)
        throw std::runtime_error(message);
}
int main(int argc, char** argv)
{
    DynamicPrintConfig imported;
    for (const auto* key : {"prime_tower_brim_width", "raft_first_layer_expansion", "tree_support_wall_count"})
        imported.set_deserialize_strict(key, "-1");
    for (const auto* key : {"solid_infill_filament", "sparse_infill_filament", "wall_filament"})
        imported.set_deserialize_strict(key, "0");
    check(imported.empty(), "Sentinels must not override the enclosing preset");
    imported.set_deserialize_strict("extruder", "3");
    imported.normalize_fdm();
    check(imported.opt_int("wall_filament") == 3 && imported.opt_int("sparse_infill_filament") == 3 &&
              imported.opt_int("solid_infill_filament") == 3,
          "Part must retain filament 3");
    DynamicPrintConfig config = DynamicPrintConfig::full_print_config();
    config.apply(imported);
    check(config.validate().empty(), "Inherited defaults must validate");
    config.set_deserialize_strict("wall_filament", "2");
    config.set_deserialize_strict("prime_tower_brim_width", "7.5");
    check(config.opt_int("wall_filament") == 2 && config.opt_float("prime_tower_brim_width") == 7.5, "Explicit values changed");
    config.set_deserialize_strict("tree_support_wall_count", "-2");
    check(config.validate().count("tree_support_wall_count") == 1, "Other invalid values must still be reported");
    if (argc > 1) {
        DynamicPrintConfig                 project;
        ConfigSubstitutionContext          substitutions(ForwardCompatibilitySubstitutionRule::Enable);
        std::map<std::string, std::string> keys;
        std::string                        reason;
        check(project.load_from_json(argv[1], substitutions, true, keys, reason) == 0, "Project JSON must load");
        auto merged = DynamicPrintConfig::full_print_config();
        merged.apply(project);
        auto invalid = merged.validate();
        for (const auto& item : invalid)
            std::cerr << item.first << ": " << item.second << '\n';
        check(invalid.empty(), "Downloaded project's settings must validate");
        check(project.opt<ConfigOptionStrings>("filament_colour")->values.size() == 3, "Three project colors must be retained");
    }
    std::cout << "PASS: Bambu sentinels, inherited part colors, explicit values, invalid-value checks and project JSON\n";
}
