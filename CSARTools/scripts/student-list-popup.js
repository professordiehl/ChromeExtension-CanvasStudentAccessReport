//Written by Jason Diehl, eLearning Systems Administrator, Oaks Christian School 2016.
//Only the first 100 group categories (aka group sets) will be displayed.

/*jshint
    browser: true, nomen: true, regexp: true, devel: true, sub: true
*/

/*globals
    chrome, ExcelBuilder, ga, Util
*/

var EXPORT_FORMAT,
    COURSE_ID = -1,
    HOST = "",
    pending = {}; //key-value store for recursive calls and per-category global variables

chrome.storage.sync.get({
    exportFormat: 'xlsx' //default to xlsx format
}, setExportFormatFromSettings);


function setExportFormatFromSettings(items) {
    EXPORT_FORMAT = items.exportFormat;
}


document.addEventListener('DOMContentLoaded', function () {
    getCurrentTabUrl(populateCourseLists);
});


//function from https://developer.chrome.com/extensions/getstarted
function getCurrentTabUrl(callback) {
    var queryInfo = {
        active: true,
        windowId: chrome.windows.WINDOW_ID_CURRENT
    };

    chrome.tabs.query(queryInfo, function (tabs) {
        var tab = tabs[0],
            url = tab.url;

        callback(url);
    });
}


function populateCourseLists(url) {
    //find course number and host (oakschristian.instructure.com or 
    //oakschristian.test.instructure.com) from current url

    var roleXhr,
        RegExResults;

    RegExResults = /(https\:\/\/.+)\/courses\/(\d+)(\/.+)?/.exec(url);

    try {
        HOST = RegExResults[1];
        COURSE_ID = RegExResults[2];
    } catch (ex) {
        console.log(ex.message);
        return;
    }

    if (COURSE_ID > 0) {
        renderStatus('status', 'Course found on current page. Id: ' + COURSE_ID);

        //check user role for course
        roleXhr = new XMLHttpRequest();
        roleXhr.onreadystatechange = proceedIfStaff;

        roleXhr.open("GET", HOST + "/api/v1/courses/" + COURSE_ID + "/enrollments?state[]=active&user_id=self", true); //async
        roleXhr.send();
    }
}


function proceedIfStaff() {
    //'this' is the roleXhr
    if (this.readyState == 4 && this.status == 200) {
        var json = /(?:while\(1\);)?(.+)/.exec(this.responseText);
        json = JSON.parse(json[1]);

        if (Util.hasTeacherEnrolment(json)) {
            var enrollmentHeading,
                enrollmentReportButton,
                sectionListHeading,
                sectionsXhr,
                groupCatXhr,
                groupCatListHeading;

            //unhide enrollment report heading
            enrollmentHeading = document.getElementById('enrollmentHeading');
            enrollmentHeading.hidden = null;

            enrollmentReportButton = document.getElementById('enrollmentReport');
            enrollmentReportButton.addEventListener('click', trackButtonClick);
            enrollmentReportButton.addEventListener('click', enrollmentReportButtonClick);

            //unhide section list heading
            sectionListHeading = document.getElementById('sectionListHeading');
            sectionListHeading.hidden = null;

            //unhide group category list heading
            groupCatListHeading = document.getElementById('groupCatListHeading');
            groupCatListHeading.hidden = null;

            //Get sections (only up to 100?)
            sectionsXhr = new XMLHttpRequest();
            sectionsXhr.onreadystatechange = appendSections;

            sectionsXhr.open("GET", HOST + "/api/v1/courses/" + COURSE_ID + "/sections?include[]=students", true); //async
            sectionsXhr.send();

            //Get group categories (only up to 100?)
            groupCatXhr = new XMLHttpRequest();
            groupCatXhr.onreadystatechange = appendGroupCategories;

            groupCatXhr.open("GET", HOST + "/api/v1/courses/" + COURSE_ID + "/group_categories?per_page=100", true); //async
            groupCatXhr.send();
        } //else if not teaching staff do nothing
    }
}


function enrollmentReportButtonClick() {
    var label,
        enrollmentXhr,
        url,
        state,
        enrollmentsList = [];

    //show 'Processing...' label
    label = document.getElementById('enrollmentReportProcessingLabel');
    label.hidden = null;

    pending['enrollment'] = 0;

    //get active enrollments first
    state = 'active';
    url = HOST + '/api/v1/courses/' + COURSE_ID + '/enrollments?type[]=StudentEnrollment&state[]=' + state + '&per_page=100';
    getEnrolments(url, state, enrollmentsList);
}


function getEnrolments(url, state, enrollmentsList) {
    try {
        pending['enrollment'] += 1;

        var enrollmentXhr = new XMLHttpRequest();
        enrollmentXhr.onreadystatechange = function processGroupResponse() {
            //'this' is enrollmentXhr
            if (this.readyState == 4 && this.status == 200) {
                var enrollmentJson = /(?:while\(1\);)?(.+)/.exec(this.responseText);
                var enrollments = JSON.parse(enrollmentJson[1]);

                if (enrollments.length > 0) {
                    Array.prototype.push.apply(enrollmentsList, enrollments);
                }

                var next = Util.nextURL(this.getResponseHeader('Link'));
                if (next) {
                    getEnrolments(next, state, enrollmentsList);
                }

                pending['enrollment'] -= 1;

                if (pending['enrollment'] <= 0) {
                    if (state === 'active') {
                        //after active enrollments are complete, get deleted enrollments
                        state = 'deleted';
                        url = HOST + '/api/v1/courses/' + COURSE_ID + '/enrollments?type[]=StudentEnrollment&state[]=' + state + '&per_page=100';
                        getEnrolments(url, state, enrollmentsList);

                    } else { //state is deleted (and active enrollments have already been retrieved)
                        processEnrolments(enrollmentsList);
                    }

                }
            }
        };

        enrollmentXhr.open('GET', url, true); //async call
        enrollmentXhr.send();

    } catch (e) {
        Util.errorHandler(e);
    }
}


function processEnrolments(enrollmentsList) {
    //console.log(enrollmentsList);

    var dataRows,
        sectionXhr,
        json,
        sections,
        sectionsLookup = {};

    //get section names synchronously
    sectionXhr = new XMLHttpRequest();
    sectionXhr.open('GET', HOST + '/api/v1/courses/' + COURSE_ID + '/sections', false);
    sectionXhr.send();

    json = /(?:while\(1\);)?(.+)/.exec(sectionXhr.responseText);
    sections = JSON.parse(json[1]);

    //console.log(sections);

    sections.forEach(function(s) {
        sectionsLookup[s.id] = s;
    });

    if (EXPORT_FORMAT === 'tsv') {
        dataRows = [['state', 'created_at', 'updated_at', 'canvas user id', 'student id', 'student name', 'student sortable name', 'student username', 'student e-mail', 'section id', 'section name'].join('\t')];

    } else if (EXPORT_FORMAT === 'xlsx') {
        dataRows = [['state', 'created_at', 'updated_at', 'canvas user id', 'student id', 'student name', 'student sortable name', 'student username', 'student e-mail', 'section id', 'section name']];
    }

    enrollmentsList.forEach(function (enrollment) {
        if (EXPORT_FORMAT === 'tsv') {
            dataRows.push([[
                    enrollment.enrollment_state,
                    Util.utcToExcel(enrollment.created_at),
                    Util.utcToExcel(enrollment.updated_at),
                    enrollment.user.id,
                    enrollment.user.sis_user_id,
                    enrollment.user.name,
                    enrollment.user.sortable_name,
                    enrollment.user.login_id,
                    enrollment.user.login_id + '@student.oakschristian.org',
                    enrollment.course_section_id,
                    sectionsLookup[enrollment.course_section_id].name
                ].join('\t')]);

        } else if (EXPORT_FORMAT === 'xlsx') {
            dataRows.push([
                    enrollment.enrollment_state,
                    Util.utcToExcel(enrollment.created_at),
                    Util.utcToExcel(enrollment.updated_at),
                    enrollment.user.id,
                    enrollment.user.sis_user_id,
                    enrollment.user.name,
                    enrollment.user.sortable_name,
                    enrollment.user.login_id,
                    enrollment.user.login_id + '@student.oakschristian.org',
                    enrollment.course_section_id,
                    sectionsLookup[enrollment.course_section_id].name
                ]);
        }
    });

    exportData(dataRows, Util.getTimestamp() + '-enrollment-report');

    var label = document.getElementById('enrollmentReportProcessingLabel');
    label.hidden = 'hidden';
}


function appendSections() {
    //'this' is the sectionsXhr

    if (this.readyState == 4 && this.status == 200) {
        var json = /(?:while\(1\);)?(.+)/.exec(this.responseText);
        json = JSON.parse(json[1]);

        generateSectionList(json);
    }
}


function generateSectionList(sections) {
    var allSectionsData,
        allButton,
        sectionListHeading = document.getElementById('sectionListHeading');

    //sort alphabetically ascending by name
    sections.sort(function (a, b) {
        return (a.name > b.name) - (a.name < b.name);
    });

    if (EXPORT_FORMAT === 'tsv') {
        allSectionsData = [['section name', 'student name', 'student sortable name', 'student id', 'student username', 'student e-mail'].join('\t')];

    } else if (EXPORT_FORMAT === 'xlsx') {
        allSectionsData = [['section name', 'student name', 'student sortable name', 'student id', 'student username', 'student e-mail']];
    }

    sections.forEach(function (section) {
        if (section.students.length > 0) {

            var newbutton = document.createElement('button');
            newbutton.textContent = section.name;
            newbutton.addEventListener('click', trackButtonClick);
            newbutton.addEventListener('click', function () {
                var dataRows = createSectionData(section);
                exportData(dataRows, section.name);
            });

            sectionListHeading.appendChild(newbutton);

            //accumulate array for allSectionsData
            allSectionsData = allSectionsData.concat(createSectionDataSpecifyHeader(section, false));
        }
    });

    //add button for all sections
    allButton = document.createElement('button');
    allButton.textContent = 'ALL-SECTIONS';
    allButton.addEventListener('click', trackButtonClick);
    allButton.addEventListener('click', function () {
        exportData(allSectionsData, 'ALL-SECTIONS');
    });
    sectionListHeading.appendChild(allButton);

    renderStatus('sectionListStatus', 'Sections loaded');
}


//function from https://developer.chrome.com/extensions/getstarted
function renderStatus(id, statusText) {
    document.getElementById(id).textContent = statusText;
}


function createSectionDataSpecifyHeader(section, withHeader) {
    var dataRows = [];

    if (withHeader) {
        if (EXPORT_FORMAT === 'tsv') {
            dataRows = [['section name', 'student name', 'student sortable name', 'student id', 'student username', 'student e-mail'].join('\t')];

        } else if (EXPORT_FORMAT === 'xlsx') {
            dataRows = [['section name', 'student name', 'student sortable name', 'student id', 'student username', 'student e-mail']];
        }
    }

    section.students.forEach(function (student) {
        //console.log('\t' + student.name + ' (' + student.login_id + ')')

        if (EXPORT_FORMAT === 'tsv') {
            dataRows.push([[section.name, student.name, student.sortable_name, student.sis_user_id, student.sis_login_id, student.sis_login_id + '@student.oakschristian.org'].join('\t')]);

        } else if (EXPORT_FORMAT === 'xlsx') {
            dataRows.push([section.name, student.name, student.sortable_name, student.sis_user_id, student.sis_login_id, student.sis_login_id + '@student.oakschristian.org']);

        }
    });

    return dataRows;
}


function createSectionData(section) {
    return createSectionDataSpecifyHeader(section, true);
}


function appendGroupCategories() {
    //'this' is the groupCatXhr
    if (this.readyState === 4 && this.status === 200) {
        var json = /(?:while\(1\);)?(.+)/.exec(this.responseText);

        json = JSON.parse(json[1]);

        json.sort(function (a, b) {
            return (a.name > b.name) - (a.name < b.name);
        });

        json.forEach(function (groupCat) {

            var label = document.createElement('span');
            label.className = 'label';
            label.appendChild(document.createTextNode('Processing ' + groupCat.name + ' ...'));
            label.style.display = 'none';
            label.id = groupCat.id + '_' + groupCat.name;

            pending['label' + groupCat.id] = label.id;

            var newbutton = document.createElement('button');
            newbutton.textContent = groupCat.name;
            newbutton.addEventListener('click', trackButtonClick);
            newbutton.addEventListener('click', function () {
                generateGroupList(groupCat);
            });

            var div = document.createElement('div'); //div or p or span

            div.appendChild(newbutton);
            div.appendChild(label);

            var groupCatListHeading = document.getElementById('groupCatListHeading');
            groupCatListHeading.appendChild(div);
        });

        renderStatus('groupCatListStatus', 'Group Categories loaded');
    }
}


function generateGroupList(groupCat) {
    //get all groups
    var label = document.getElementById(pending['label' + groupCat.id]);
    label.style.display = 'inline';

    var url = HOST + '/api/v1/group_categories/' + groupCat.id + '/groups?per_page=100';
    pending['group' + groupCat.id] = 0;
    pending['name' + groupCat.id] = groupCat.name;

    getGroups(url, groupCat, []);
}


function getGroups(url, groupCat, groupsList) {
    try {
        pending['group' + groupCat.id] += 1;

        var groupXhr = new XMLHttpRequest();
        groupXhr.onreadystatechange = function processGroupResponse() {
            //'this' is groupXhr
            if (this.readyState == 4 && this.status == 200) {
                var groupsJson = /(?:while\(1\);)?(.+)/.exec(this.responseText);
                var groups = JSON.parse(groupsJson[1]);

                if (groups.length > 0) {
                    Array.prototype.push.apply(groupsList, groups);
                }

                var next = Util.nextURL(this.getResponseHeader('Link'));
                if (next) {
                    getGroups(next, groupCat, groupsList);
                }

                pending['group' + groupCat.id] -= 1;
                if (pending['group' + groupCat.id] <= 0) {
                    //console.log(groupsList);
                    processGroups(groupCat, groupsList);
                }
            }
        };

        groupXhr.open('GET', url, true); //async call
        groupXhr.send();

    } catch (e) {
        Util.errorHandler(e);
    }
}


function processGroups(groupCat, groupsList) {
    //go through each group in groupsList and get members

    var label,
        dataRows,
        url;

    if (groupsList.length > 0) {
        if (EXPORT_FORMAT === 'tsv') {
            dataRows = [['group name', 'student name', 'student sortable name', 'student id', 'student username', 'student e-mail'].join('\t')];

        } else if (EXPORT_FORMAT === 'xlsx') {
            dataRows = [['group name', 'student name', 'student sortable name', 'student id', 'student username', 'student e-mail']];
        }

        pending['member' + groupCat.id] = 0;

        groupsList.forEach(function (group) {
            url = HOST + '/api/v1/groups/' + group.id + '/users?per_page=100';

            getMembers(url, group, dataRows);
        });

    } else {
        label = document.getElementById(pending['label' + groupCat.id]);
        label.textContent = '(Contains no groups)';
    }
}


function getMembers(url, group, dataRows) {
    try {
        pending['member' + group.group_category_id] += 1;

        var memberXhr = new XMLHttpRequest();
        memberXhr.onreadystatechange = function processGroupResponse() {
            //'this' is memberXhr
            if (this.readyState == 4 && this.status == 200) {
                var membersJson = /(?:while\(1\);)?(.+)/.exec(this.responseText);
                var members = JSON.parse(membersJson[1]);

                if (members.length > 0) {

                    members.forEach(function (member) {
                        if (EXPORT_FORMAT === 'tsv') {
                            dataRows.push([[group.name, member.name, member.sortable_name, member.sis_user_id, member.sis_login_id, member.sis_login_id + '@student.oakschristian.org'].join('\t')]);

                        } else if (EXPORT_FORMAT === 'xlsx') {
                            dataRows.push([group.name, member.name, member.sortable_name, member.sis_user_id, member.sis_login_id, member.sis_login_id + '@student.oakschristian.org']);
                        }
                    });
                }

                var next = Util.nextURL(this.getResponseHeader('Link'));
                if (next) {
                    getMembers(next, group, dataRows);
                }

                pending['member' + group.group_category_id] -= 1;
                if (pending['member' + group.group_category_id] <= 0) {

                    exportData(dataRows, pending['name' + group.group_category_id]);

                    //remove 'processing...' label
                    var label = document.getElementById(pending['label' + group.group_category_id]);
                    label.style.display = 'none';
                }
            }
        };

        memberXhr.open('GET', url, true); //async call
        memberXhr.send();

    } catch (e) {
        Util.errorHandler(e);
    }
}


function exportData(dataRows, filename) {
    var tsvString,
        excelData, workbook, list,
        blob,
        a = document.createElement('a');

    if (EXPORT_FORMAT === 'tsv') {
        tsvString = dataRows.join('\r\n');

        blob = new Blob([tsvString], {
            type: 'text/plain'
        });

        a.href = URL.createObjectURL(blob);

    } else if (EXPORT_FORMAT === 'xlsx') {
        workbook = ExcelBuilder.createWorkbook();
        list = workbook.createWorksheet({
            name: 'list'
        });

        list.setData(dataRows);
        workbook.addWorksheet(list);
        excelData = ExcelBuilder.createFile(workbook);

        blob = new Blob([Util.s2ab(atob(excelData))], {
            type: ''
        });

        a.href = URL.createObjectURL(blob);
    }

    a.target = '_blank';
    a.download = filename + '.' + EXPORT_FORMAT;

    document.body.appendChild(a);
    a.click();
}


/*** Google analytics code start ***/
/* jshint ignore:start */
(function (i, s, o, g, r, a, m) {
    'use strict';
    i['GoogleAnalyticsObject'] = r;
    i[r] = i[r] || function () {
        (i[r].q = i[r].q || []).push(arguments);
    }, i[r].l = 1 * new Date();
    a = s.createElement(o),
        m = s.getElementsByTagName(o)[0];
    a.async = 1;
    a.src = g;
    m.parentNode.insertBefore(a, m)
})(window, document, 'script', 'https://www.google-analytics.com/analytics.js', 'ga');
/* jshint ignore:end */

ga('create', 'UA-72936301-1', 'auto');
ga('set', 'checkProtocolTask', null); // Disable file protocol checking.
ga('send', 'pageview', '/studentListPopup.html');

function trackButtonClick(e) {
    ga('send', 'event', 'StudentList', 'Download', e.target.innerText);
}
/*** Google analytics code end ***/
