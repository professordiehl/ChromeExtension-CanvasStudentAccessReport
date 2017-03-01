//Written by Jason Diehl, eLearning Systems Administrator, Oaks Christian School 2016.
//Adapted from the Canvancement project (https://github.com/jamesjonesmath/canvancement).  Many thanks to James Jones @ Richland U!!!

/*jshint
    browser: true, regexp: true, devel: true, jquery: true
*/
/*globals
    chrome, ga, ExcelBuilder, Util
*/

var courseId = -1,
    userData = {},
    userCount = 0,
    accessData = [],
    pending = -1,
    EXPORT_FORMAT,
    TSV = 'tsv',
    XLSX = 'xlsx';

chrome.storage.sync.get({
    exportFormat: XLSX //default to xlsx format
}, setExportFormatFromSettings);


function setExportFormatFromSettings(items) {
    EXPORT_FORMAT = items.exportFormat;
}


addaccessStudentReportButton();


function addaccessStudentReportButton() {
    courseId = getCourseId();

    var roleXhr = new XMLHttpRequest();
    roleXhr.onreadystatechange = proceedIfStaff;

    roleXhr.open("GET", "/api/v1/courses/" + courseId + "/enrollments?state[]=active&user_id=self", true); //async
    roleXhr.send();
}


function proceedIfStaff() {
    //'this' is the roleXhr
    if (this.readyState == 4 && this.status == 200) {
        var json = /(?:while\(1\);)?(.+)/.exec(this.responseText);
        json = JSON.parse(json[1]);

        if (Util.hasTeacherEnrolment(json)) {
            var status = document.createElement('div');
            status.id = 'accessStudentReportStatus';

            var button = document.createElement('a');
            button.id = 'accessStudentReportButton';
            button.title = 'Button added by CSAR  Tool';
            button.className = 'btn button-sidebar-wide';
            button.addEventListener('click', accessStudentReport);

            var i = document.createElement('i');
            i.className = 'icon-analytics';

            button.appendChild(i);
            button.appendChild(document.createTextNode('  Student Access Report'));
            button.appendChild(status);

            var sidebar = document.evaluate(".//div[@id='right-side-wrapper']//div", document.body, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            sidebar.appendChild(button);
        }
    }
}


function accessStudentReport() {
    document.getElementById('accessStudentReportStatus').textContent = 'Generating...';

    var url = '/api/v1/courses/' + courseId + '/users?enrollment_type[]=student&per_page=100';

    pending = 0;
    getStudents(courseId, url);
}


function getStudents(courseId, url) {
    //    console.log('getStudents invoked with course id and url: ' + courseId + ' :: ' + url);

    try {
        pending++;
        $.getJSON(url, function (udata, status, jqXHR) {
            url = Util.nextURL(jqXHR.getResponseHeader('Link'));
            for (var i = 0; i < udata.length; i++) {
                userData[udata[i].id] = udata[i];
            }
            userCount += udata.length;
            if (userCount === 0) { //there are no student accesses
                document.getElementById('accessStudentReportStatus').textContent = 'No accesses found';
                return;
            }
            if (url) {
                getStudents(courseId, url);
            }
            pending--;
            if (pending <= 0) {
                getaccessStudentReport(courseId);
            }
        }).fail(function () {
            pending = -1;
            throw new Error('Failed to load list of students');
        });
    } catch (e) {
        ga('send', 'event', 'accessStudentReport', 'Error', e);

        document.getElementById('accessStudentReportStatus').textContent = '';
        Util.errorHandler(e);
    }
}

function getaccessStudentReport(courseId) {
    pending = 0;
    for (var id in userData) {
        if (userData.hasOwnProperty(id)) {
            var url = '/courses/' + courseId + '/users/' + id + '/usage.json?per_page=100';

            getAccesses(courseId, url);
        }
    }
}

function getAccesses(courseId, url) {
    //    console.log('getAccesses invoked with course id and url: ' + courseId + ' :: ' + url);

    try {
        pending++;
        $.getJSON(url, function (adata, status, jqXHR) {
            url = Util.nextURL(jqXHR.getResponseHeader('Link'));
            accessData.push.apply(accessData, adata);
            if (url) {
                getAccesses(courseId, url);
            }
            pending--;
            if (pending <= 0) {
                makeReport();
            }
        }).fail(function () {
            pending--;
            console.log('Some access report data failed to load');
            if (pending <= 0) {
                makeReport();
            }
        });
    } catch (e) {
        ga('send', 'event', 'accessStudentReport', 'Error', e);

        document.getElementById('accessStudentReportStatus').textContent = '';
        Util.errorHandler(e);
    }
}

function getCourseId() {
    var courseRegex = new RegExp('/courses/([0-9]+)');
    var courseId = null;
    var matches = courseRegex.exec(window.location.href);

    try {

        if (matches) {
            courseId = matches[1];
        } else {
            throw new Error('Unable to detect Course ID');
        }
    } catch (e) {
        ga('send', 'event', 'accessStudentReport', 'Error', e);

        document.getElementById('accessStudentReportStatus').textContent = '';
        Util.errorHandler(e);
    }
    return courseId;
}


function makeReport() {
    try {
        var csv = createCSV(); //and tsv
        ga('send', 'event', 'accessStudentReport', 'Download', 'Users: ' + userCount + '; Accesses: ' + accessData.length);

        if (csv) {
            var href = '';
            var blob;

            if (EXPORT_FORMAT === TSV) {
                blob = new Blob([csv], {
                    type: 'text/plain'
                        //                    type: 'text/csv'
                });

                href = URL.createObjectURL(blob);

            } else if (EXPORT_FORMAT === XLSX) {
                var workbook = ExcelBuilder.createWorkbook();
                var list = workbook.createWorksheet({
                    name: 'list'
                });

                list.setData(csv);
                workbook.addWorksheet(list);
                var data = ExcelBuilder.createFile(workbook);

                blob = new Blob([Util.s2ab(atob(data))], {
                    type: ''
                });

                href = URL.createObjectURL(blob);
            }

            var a = document.createElement('a');
            a.setAttribute('download', Util.getTimestamp() + '-access-report.' + EXPORT_FORMAT);

            a.href = href;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            $('#accessStudentReportButton').one('click', accessStudentReport);

            document.getElementById('accessStudentReportStatus').textContent = '';

        } else {
            throw new Error('Problem creating report');
        }
    } catch (e) {
        ga('send', 'event', 'accessStudentReport', 'Error', e);

        document.getElementById('accessStudentReportStatus').textContent = '';
        Util.errorHandler(e);
    }
}

function createCSV() {
    var fields = [
        {
            'name': 'User ID',
            'src': 'u.id'
      },
        {
            'name': 'Display Name',
            'src': 'u.name'
      },
        {
            'name': 'Sortable Name',
            'src': 'u.sortable_name'
      },
        {
            'name': 'Category',
            'src': 'a.asset_category'
      },
        {
            'name': 'Class',
            'src': 'a.asset_class_name'
      },
        {
            'name': 'Title',
            'src': 'a.readable_name'
      },
        {
            'name': 'Views',
            'src': 'a.view_score'
      },
        {
            'name': 'Participations',
            'src': 'a.participate_score'
      },
        {
            'name': 'Last Access',
            'src': 'a.last_access',
            'fmt': 'date'
      },
        {
            'name': 'First Access',
            'src': 'a.created_at',
            'fmt': 'date'
      },
        {
            'name': 'Action',
            'src': 'a.action_level'
      },
        {
            'name': 'Code',
            'src': 'a.asset_code'
      },
        {
            'name': 'Group Code',
            'src': 'a.asset_group_code'
      },
        {
            'name': 'Context Type',
            'src': 'a.context_type'
      },
        {
            'name': 'Context ID',
            'src': 'a.context_id'
      },
        {
            'name': 'Login ID',
            'src': 'u.login_id'
      },
        {
            'name': 'SIS Login ID',
            'src': 'u.sis_login_id',
            'sis': true
      },
        {
            'name': 'SIS User ID',
            'src': 'u.sis_user_id',
            'sis': true
      }
    ];
    var canSIS = false;
    for (var id in userData) {
        if (userData.hasOwnProperty(id)) {
            if (typeof userData[id].sis_user_id !== 'undefined' && userData[id].sis_user_id) {
                canSIS = true;
                break;
            }
        }
    }
    var CRLF = '\r\n';
    var hdr = [];
    fields.map(function (e) {
        if (typeof e.sis === 'undefined' || (e.sis && canSIS)) {
            hdr.push(e.name);
        }
    });

    var data; //for TSV and CSV data is a string; for XLSX data is an array of arrays

    if (EXPORT_FORMAT === TSV) {
        //    var t = hdr.join(',') + CRLF; //csv
        data = hdr.join('\t') + CRLF; //tsv
    } else if (EXPORT_FORMAT === XLSX) {
        data = [hdr]; //array for xlsx
    }

    var item,
        user,
        userId,
        fieldInfo,
        value,
        fieldRegex = new RegExp('^([au])[.](.*)$');

    for (var i = 0; i < accessData.length; i++) {
        var row = [];

        item = accessData[i].asset_user_access;
        userId = item.user_id;
        user = userData[userId];
        for (var j = 0; j < fields.length; j++) {
            if (typeof fields[j].sis !== 'undefined' && fields[j].sis && !canSIS) {
                continue;
            }
            fieldInfo = fields[j].src.split('.');
            value = fieldInfo[0] == 'a' ? item[fieldInfo[1]] : user[fieldInfo[1]];
            if (value === null) {
                value = '';
            } else {
                if (typeof fields[j].fmt !== 'undefined') {
                    switch (fields[j].fmt) {
                        case 'date':
                            try {
                                value = Util.utcToExcel(value);
                            } catch (e) {
                                ga('send', 'event', 'accessStudentReport', 'Error', e);

                                document.getElementById('accessStudentReportStatus').textContent = '';
                                Util.errorHandler(e);
                            }
                            break;
                        default:
                            break;
                    }
                }
                if (typeof value === 'string') {
                    var quote = false;
                    if (value.indexOf('"') > -1) {
                        value = value.replace('"', '""');
                        quote = true;
                    }
                    //only for CSV
                    //                    if (value.indexOf(',') > -1) {
                    //                        quote = true;
                    //                    }
                    if (quote) {
                        value = '"' + value + '"';
                    }
                }
            }
            if (EXPORT_FORMAT === TSV && j > 0) {
                //                data += ','; //csv
                data += '\t'; //tsv
            }

            if (EXPORT_FORMAT === TSV) {
                data += value; //for csv and tsv
            } else if (EXPORT_FORMAT === XLSX) {
                row.push(value);
            }
        }

        if (EXPORT_FORMAT === TSV) {
            data += CRLF; //for csv and tsv
        } else if (EXPORT_FORMAT === XLSX) {
            data.push(row); //xlsx
        }
    }
    return data;
}


/*** Google analytics code start ***/
/* jshint ignore:start */
window['GoogleAnalyticsObject'] = 'ga';
window['ga'] = window['ga'] || function () {
    (window['ga'].q = window['ga'].q || []).push(arguments);
}, window['ga'].l = 1 * new Date();
/* jshint ignore:end */

ga('create', 'UA-72936301-1', 'auto');
ga('set', 'checkProtocolTask', null); // Disable file protocol checking.
/*** Google analytics code end ***/
