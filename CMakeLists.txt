cmake_minimum_required(VERSION 4.0.0)

project(cajon LANGUAGES CXX)

include(GNUInstallDirs)

find_package(PkgConfig REQUIRED)

set(main cajon)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(${main} main.cpp)


pkg_check_modules(Lua REQUIRED IMPORTED_TARGET GLOBAL lua)

target_link_libraries(${main} PRIVATE PkgConfig::Lua)

install(TARGETS ${main}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)
